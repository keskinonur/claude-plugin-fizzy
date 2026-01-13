export interface FizzyConfig {
  token: string;
  url: string;
}

export interface Account {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Board {
  id: string;
  name: string;
  all_access: boolean;
  created_at: string;
  url: string;
}

export interface Card {
  id: string;
  number: number;
  title: string;
  status: string;
  description: string;
  description_html: string;
  closed: boolean;
  golden: boolean;
  last_active_at: string;
  created_at: string;
  url: string;
  steps?: Step[];
}

export interface Step {
  id: string;
  content: string;
  completed: boolean;
}

export interface Column {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

interface RequestOptions {
  method: string;
  endpoint: string;
  data?: unknown;
  returnLocation?: boolean;
}

export class FizzyClient {
  private token: string;
  private baseUrl: string;
  private accountSlug: string | null = null;

  constructor(config: FizzyConfig) {
    // Security: Enforce HTTPS unless explicitly in development mode
    // Use URL parsing to prevent subdomain bypass (e.g., evil.localhost.com)
    let isLocalhost = false;
    try {
      const url = new URL(config.url);
      isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    } catch {
      // Invalid URL will fail HTTPS check below
    }
    const isDev = process.env.NODE_ENV === "development" || isLocalhost;
    if (!isDev && !config.url.startsWith("https://")) {
      throw new Error("Fizzy API URL must use HTTPS for security");
    }
    this.token = config.token;
    this.baseUrl = config.url;
  }

  private async request<T>(options: RequestOptions): Promise<T>;
  private async request<T>(options: RequestOptions & { returnLocation: true }): Promise<{ data: T; location: string | null }>;
  private async request<T>(options: RequestOptions): Promise<T | { data: T; location: string | null }> {
    const { method, endpoint, data, returnLocation } = options;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };

    if (data) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Fizzy API error: ${response.status} ${response.statusText}`);
    }

    let responseData = {} as T;
    if (response.status !== 204) {
      try {
        responseData = await response.json() as T;
      } catch {
        // No body
      }
    }

    if (returnLocation) {
      return { data: responseData, location: response.headers.get("location") };
    }

    return responseData;
  }

  async getAccountSlug(): Promise<string> {
    if (this.accountSlug) {
      return this.accountSlug;
    }

    const identity = await this.request<{ accounts: Account[] }>({
      method: "GET",
      endpoint: "/my/identity",
    });

    if (!identity.accounts?.length) {
      throw new Error("No Fizzy accounts found for this token");
    }

    this.accountSlug = identity.accounts[0].slug;
    return this.accountSlug;
  }

  private extractFromLocation(location: string | null, pattern: RegExp): string {
    if (!location) {
      throw new Error("Failed to get location from response");
    }
    const match = location.match(pattern);
    if (!match) {
      throw new Error("Failed to parse ID from location");
    }
    return match[1];
  }

  // Type-safe helper for POST requests that need the Location header
  private async postWithLocation(endpoint: string, data: unknown): Promise<string | null> {
    const result = await this.request<unknown>({
      method: "POST",
      endpoint,
      data,
      returnLocation: true as const,
    });
    // TypeScript now infers this correctly due to 'as const'
    return (result as { data: unknown; location: string | null }).location;
  }

  private parseCardNumber(location: string | null): number {
    const idStr = this.extractFromLocation(location, /\/cards\/(\d+)/);
    const cardNumber = parseInt(idStr, 10);
    if (isNaN(cardNumber)) {
      throw new Error("Failed to parse card number from location");
    }
    return cardNumber;
  }

  async listBoards(): Promise<Board[]> {
    const slug = await this.getAccountSlug();
    return this.request<Board[]>({ method: "GET", endpoint: `${slug}/boards` });
  }

  async getBoard(boardId: string): Promise<Board> {
    const slug = await this.getAccountSlug();
    return this.request<Board>({ method: "GET", endpoint: `${slug}/boards/${boardId}` });
  }

  async createBoard(name: string): Promise<Board> {
    const slug = await this.getAccountSlug();
    const location = await this.postWithLocation(`${slug}/boards`, { board: { name } });
    const boardId = this.extractFromLocation(location, /\/boards\/([^/.]+)/);
    return this.getBoard(boardId);
  }

  async findBoardByName(name: string): Promise<Board | null> {
    const boards = await this.listBoards();
    return boards.find((b) => b.name === name) || null;
  }

  async listCards(boardIds?: string[]): Promise<Card[]> {
    const slug = await this.getAccountSlug();
    const params = boardIds?.length ? `?${boardIds.map((id) => `board_ids[]=${id}`).join("&")}` : "";
    return this.request<Card[]>({ method: "GET", endpoint: `${slug}/cards${params}` });
  }

  async getCard(cardNumber: number): Promise<Card> {
    const slug = await this.getAccountSlug();
    return this.request<Card>({ method: "GET", endpoint: `${slug}/cards/${cardNumber}` });
  }

  async createCard(boardId: string, title: string, description?: string): Promise<number> {
    const slug = await this.getAccountSlug();
    const card = description ? { title, description } : { title };
    const location = await this.postWithLocation(`${slug}/boards/${boardId}/cards`, { card });
    return this.parseCardNumber(location);
  }

  async updateCard(cardNumber: number, updates: { title?: string; description?: string }): Promise<void> {
    const slug = await this.getAccountSlug();
    await this.request({ method: "PUT", endpoint: `${slug}/cards/${cardNumber}`, data: { card: updates } });
  }

  async closeCard(cardNumber: number): Promise<void> {
    const slug = await this.getAccountSlug();
    await this.request({ method: "POST", endpoint: `${slug}/cards/${cardNumber}/closure` });
  }

  async reopenCard(cardNumber: number): Promise<void> {
    const slug = await this.getAccountSlug();
    await this.request({ method: "DELETE", endpoint: `${slug}/cards/${cardNumber}/closure` });
  }

  async addStep(cardNumber: number, content: string): Promise<string> {
    const slug = await this.getAccountSlug();
    const location = await this.postWithLocation(`${slug}/cards/${cardNumber}/steps`, { step: { content } });
    return this.extractFromLocation(location, /\/steps\/([^/]+)\.json/);
  }

  async updateStep(cardNumber: number, stepId: string, completed: boolean): Promise<void> {
    const slug = await this.getAccountSlug();
    await this.request({
      method: "PUT",
      endpoint: `${slug}/cards/${cardNumber}/steps/${stepId}`,
      data: { step: { completed } },
    });
  }

  async deleteStep(cardNumber: number, stepId: string): Promise<void> {
    const slug = await this.getAccountSlug();
    await this.request({ method: "DELETE", endpoint: `${slug}/cards/${cardNumber}/steps/${stepId}` });
  }

  async getColumns(boardId: string): Promise<Column[]> {
    const slug = await this.getAccountSlug();
    return this.request<Column[]>({ method: "GET", endpoint: `${slug}/boards/${boardId}/columns` });
  }

  async triageCard(cardNumber: number, columnId: string): Promise<void> {
    const slug = await this.getAccountSlug();
    await this.request({
      method: "POST",
      endpoint: `${slug}/cards/${cardNumber}/triage`,
      data: { column_id: columnId },
    });
  }
}
