#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { FizzyClient } from "./fizzy-client.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Load token from config file or environment
function loadConfig(): { token: string | null; url: string } {
  // 1. Try environment variable first
  if (process.env.FIZZY_TOKEN) {
    return { token: process.env.FIZZY_TOKEN, url: process.env.FIZZY_URL || "https://app.fizzy.do" };
  }

  // 2. Try plugin config file
  const configPaths = [
    path.join(os.homedir(), ".claude", "plugins", "fizzy", "config.json"),
    path.join(os.homedir(), ".claude", "plugins", "fizzy", ".env"),
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        if (configPath.endsWith(".json")) {
          const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          if (config.token) {
            return { token: config.token, url: config.url || "https://app.fizzy.do" };
          }
        } else if (configPath.endsWith(".env")) {
          const content = fs.readFileSync(configPath, "utf-8");
          const tokenMatch = content.match(/FIZZY_TOKEN=["']?([^"'\n]+)["']?/);
          const urlMatch = content.match(/FIZZY_URL=["']?([^"'\n]+)["']?/);
          if (tokenMatch) {
            return { token: tokenMatch[1], url: urlMatch?.[1] || "https://app.fizzy.do" };
          }
        }
      }
    } catch {
      // Continue to next config source
    }
  }

  return { token: null, url: "https://app.fizzy.do" };
}

// Input validation schemas
const Schemas = {
  createBoard: z.object({ name: z.string().min(1).max(100) }),
  listCards: z.object({ board_id: z.string().min(1).optional() }),
  getCard: z.object({ card_number: z.number().int().positive() }),
  createCard: z.object({
    board_id: z.string().min(1),
    title: z.string().min(1).max(200),
    description: z.string().max(10000).optional(),
  }),
  addSteps: z.object({
    card_number: z.number().int().positive(),
    steps: z.array(z.string().min(1).max(500)).min(1).max(100),
  }),
  updateStep: z.object({
    card_number: z.number().int().positive(),
    step_id: z.string().min(1),
    completed: z.boolean(),
  }),
  syncTodos: z.object({
    board_id: z.string().min(1),
    card_title: z.string().min(1).max(200),
    todos: z.array(z.object({ content: z.string().min(1).max(500), completed: z.boolean().default(false) })).min(1).max(100),
  }),
  closeCard: z.object({ card_number: z.number().int().positive() }),
};

// Lazily create client - reloads config on each call to pick up new tokens
let cachedClient: FizzyClient | null = null;
let cachedToken: string | null = null;

function getClient(): FizzyClient | null {
  const config = loadConfig();

  // If token changed, recreate client
  if (config.token !== cachedToken) {
    cachedToken = config.token;
    cachedClient = config.token ? new FizzyClient({ token: config.token, url: config.url }) : null;
  }

  return cachedClient;
}

const server = new Server(
  { name: "fizzy-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

interface ToolProperty {
  type: string;
  description: string;
  items?: { type: string; properties?: Record<string, ToolProperty>; required?: string[] };
}

function prop(type: string, desc: string): ToolProperty {
  return { type, description: desc };
}

interface ToolDefinition {
  name: string;
  description: string;
  props: Record<string, ToolProperty>;
  required: string[];
}

const TOOLS: ToolDefinition[] = [
  {
    name: "fizzy_list_boards",
    description: "List all Fizzy.do boards",
    props: {},
    required: [],
  },
  {
    name: "fizzy_create_board",
    description: "Create a new Fizzy.do board",
    props: { name: prop("string", "Name for the new board") },
    required: ["name"],
  },
  {
    name: "fizzy_list_cards",
    description: "List cards, optionally filtered by board",
    props: { board_id: prop("string", "Optional board ID to filter cards") },
    required: [],
  },
  {
    name: "fizzy_get_card",
    description: "Get details of a card by its number",
    props: { card_number: prop("number", "The card number to retrieve") },
    required: ["card_number"],
  },
  {
    name: "fizzy_create_card",
    description: "Create a new card in a board",
    props: {
      board_id: prop("string", "Board ID"),
      title: prop("string", "Card title"),
      description: prop("string", "Optional description (HTML)"),
    },
    required: ["board_id", "title"],
  },
  {
    name: "fizzy_add_steps",
    description: "Add steps to a card",
    props: {
      card_number: prop("number", "Card number"),
      steps: { type: "array", items: { type: "string" }, description: "Step contents" },
    },
    required: ["card_number", "steps"],
  },
  {
    name: "fizzy_update_step",
    description: "Update a step's completion status",
    props: {
      card_number: prop("number", "Card number"),
      step_id: prop("string", "Step ID"),
      completed: prop("boolean", "Completed status"),
    },
    required: ["card_number", "step_id", "completed"],
  },
  {
    name: "fizzy_sync_todos",
    description: "Sync todos to a card, creating if needed",
    props: {
      board_id: prop("string", "Board ID"),
      card_title: prop("string", "Card title"),
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: { content: prop("string", "Todo text"), completed: prop("boolean", "Completed") },
          required: ["content"],
        },
        description: "Todo items",
      },
    },
    required: ["board_id", "card_title", "todos"],
  },
  {
    name: "fizzy_close_card",
    description: "Close a card",
    props: { card_number: prop("number", "Card number to close") },
    required: ["card_number"],
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map(({ name, description, props, required }) => ({
    name,
    description,
    inputSchema: { type: "object", properties: props, required },
  })),
}));

function textResponse(text: string, isError = false): object {
  return { content: [{ type: "text", text }], ...(isError && { isError }) };
}

function jsonResponse(data: unknown): object {
  return textResponse(JSON.stringify(data, null, 2));
}

type ToolArgs = Record<string, unknown>;

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args as ToolArgs;

  // Get client (reloads config to pick up new tokens)
  const client = getClient();

  // Check if client is configured
  if (!client) {
    return textResponse(
      "Fizzy.do is not configured. Please run /fizzy:setup to set your API token.\n\n" +
      "Get your token from: https://app.fizzy.do/settings",
      true
    );
  }

  try {
    switch (name) {
      case "fizzy_list_boards":
        return jsonResponse(await client.listBoards());

      case "fizzy_create_board": {
        const { name } = Schemas.createBoard.parse(a);
        const board = await client.createBoard(name);
        return textResponse(`Created board "${board.name}" (ID: ${board.id})`);
      }

      case "fizzy_list_cards": {
        const { board_id } = Schemas.listCards.parse(a);
        const cards = await client.listCards(board_id ? [board_id] : undefined);
        return jsonResponse(cards.map((c) => ({ number: c.number, title: c.title, status: c.status, closed: c.closed, url: c.url })));
      }

      case "fizzy_get_card": {
        const { card_number } = Schemas.getCard.parse(a);
        return jsonResponse(await client.getCard(card_number));
      }

      case "fizzy_create_card": {
        const { board_id, title, description } = Schemas.createCard.parse(a);
        const fullTitle = `[Claude] ${title}`;
        const cardNumber = await client.createCard(board_id, fullTitle, description);
        return textResponse(`Created card #${cardNumber} with title "${fullTitle}"`);
      }

      case "fizzy_add_steps": {
        const { card_number, steps } = Schemas.addSteps.parse(a);
        await Promise.all(steps.map((step) => client.addStep(card_number, step)));
        return textResponse(`Added ${steps.length} steps to card #${card_number}`);
      }

      case "fizzy_update_step": {
        const { card_number, step_id, completed } = Schemas.updateStep.parse(a);
        await client.updateStep(card_number, step_id, completed);
        return textResponse(`Updated step ${step_id} on card #${card_number} to ${completed ? "completed" : "incomplete"}`);
      }

      case "fizzy_sync_todos": {
        const { board_id, card_title, todos } = Schemas.syncTodos.parse(a);
        const title = `[Claude] ${card_title}`;
        const cardNumber = await client.createCard(board_id, title);

        // Add steps sequentially to preserve order
        for (const todo of todos) {
          const stepId = await client.addStep(cardNumber, todo.content);
          if (todo.completed) {
            await client.updateStep(cardNumber, stepId, true);
          }
        }

        return textResponse(`Synced ${todos.length} todos to card #${cardNumber} "${title}"`);
      }

      case "fizzy_close_card": {
        const { card_number } = Schemas.closeCard.parse(a);
        await client.closeCard(card_number);
        return textResponse(`Closed card #${card_number}`);
      }

      default:
        return textResponse(`Unknown tool: ${name}`, true);
    }
  } catch (error) {
    // Security: Sanitize error messages to avoid information disclosure
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      return textResponse(`Validation error: ${issues}`, true);
    }
    if (!(error instanceof Error)) {
      return textResponse("Unknown error", true);
    }
    const msg = error.message;
    const errorMap: Record<string, string> = {
      "401": "Authentication failed",
      Unauthorized: "Authentication failed",
      "403": "Access denied",
      Forbidden: "Access denied",
      "404": "Resource not found",
      "Not found": "Resource not found",
      "429": "Rate limit exceeded",
    };
    for (const [pattern, response] of Object.entries(errorMap)) {
      if (msg.includes(pattern)) return textResponse(response, true);
    }
    // Sanitize Fizzy API errors - only show safe status info
    if (msg.startsWith("Fizzy API error:")) {
      const statusMatch = msg.match(/(\d{3})/);
      if (statusMatch) {
        const status = parseInt(statusMatch[1], 10);
        if (status >= 500) return textResponse("Fizzy service temporarily unavailable", true);
        if (status >= 400) return textResponse("Request to Fizzy failed", true);
      }
      return textResponse("An error occurred with the Fizzy service", true);
    }
    return textResponse("An error occurred while processing your request", true);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  console.error("Fizzy MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
