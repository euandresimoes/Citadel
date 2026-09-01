import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const SESSION_COOKIE = "citadela_session";
const CSRF_COOKIE = "citadela_csrf";

export interface LocalSessionOptions {
  actorId?: string;
  cookieSecure?: boolean;
  verifyPassword: (password: string) => Promise<boolean> | boolean;
  maxAgeMs?: number;
  idleTimeoutMs?: number;
}

export interface LocalSession {
  actorId: string;
  csrfToken: string;
}

export class LocalSessionManager {
  private readonly sessions = new Map<string, { actorId: string; csrfToken: string; createdAt: number; lastSeenAt: number }>();
  private readonly actorId: string;
  private readonly cookieSecure: boolean;
  private readonly verifyPassword: LocalSessionOptions["verifyPassword"];
  private readonly maxAgeMs: number;
  private readonly idleTimeoutMs: number;

  public constructor(options: LocalSessionOptions) {
    this.actorId = options.actorId ?? "local-user";
    this.cookieSecure = options.cookieSecure ?? false;
    this.verifyPassword = options.verifyPassword;
    this.maxAgeMs = options.maxAgeMs ?? 12 * 60 * 60 * 1000;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 30 * 60 * 1000;
  }

  public async login(password: string, response: ServerResponse): Promise<boolean> {
    if (!(await this.verifyPassword(password))) return false;
    const sessionId = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    this.issueSession(this.actorId, response, sessionId, csrfToken);
    return true;
  }

  public issue(actorId: string, response: ServerResponse): void {
    this.issueSession(actorId, response, randomBytes(32).toString("base64url"), randomBytes(32).toString("base64url"));
  }

  public logout(request: IncomingMessage, response: ServerResponse): void {
    const cookies = parseCookies(request.headers.cookie);
    if (cookies[SESSION_COOKIE]) this.sessions.delete(cookies[SESSION_COOKIE]);
    response.setHeader("set-cookie", [this.expiredCookie(SESSION_COOKIE), this.expiredCookie(CSRF_COOKIE, false)]);
  }

  public authenticate(request: IncomingMessage): LocalSession | undefined {
    const sessionId = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!sessionId) return undefined;
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const now = Date.now();
    if (now - session.createdAt > this.maxAgeMs || now - session.lastSeenAt > this.idleTimeoutMs) {
      this.sessions.delete(sessionId);
      return undefined;
    }
    session.lastSeenAt = now;
    return { actorId: session.actorId, csrfToken: session.csrfToken };
  }

  public csrfValid(request: IncomingMessage, session: { csrfToken: string }): boolean {
    const token = request.headers["x-citadela-csrf"];
    if (typeof token !== "string") return false;
    return safeEqual(token, session.csrfToken);
  }

  public static sessionCookieName(): string { return SESSION_COOKIE; }

  private issueSession(actorId: string, response: ServerResponse, sessionId: string, csrfToken: string): void {
    const now = Date.now();
    this.sessions.set(sessionId, { actorId, csrfToken, createdAt: now, lastSeenAt: now });
    response.setHeader("set-cookie", [this.cookie(SESSION_COOKIE, sessionId), this.cookie(CSRF_COOKIE, csrfToken, false)]);
  }

  private cookie(name: string, value: string, httpOnly = true): string {
    return `${name}=${value}; Path=/; SameSite=Strict${httpOnly ? "; HttpOnly" : ""}${this.cookieSecure ? "; Secure" : ""}`;
  }

  private expiredCookie(name: string, httpOnly = true): string {
    return `${name}=; Path=/; Max-Age=0; SameSite=Strict${httpOnly ? "; HttpOnly" : ""}${this.cookieSecure ? "; Secure" : ""}`;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  return Object.fromEntries((header ?? "").split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return [];
    return [[part.slice(0, separator).trim(), part.slice(separator + 1).trim()]];
  }));
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
