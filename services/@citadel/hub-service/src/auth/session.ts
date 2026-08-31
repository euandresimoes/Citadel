import { randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const SESSION_COOKIE = "citadel_session";
const CSRF_COOKIE = "citadel_csrf";

export interface LocalSessionOptions {
  actorId?: string;
  cookieSecure?: boolean;
  verifyPassword: (password: string) => Promise<boolean> | boolean;
}

export class LocalSessionManager {
  private readonly sessions = new Map<string, { actorId: string; csrfToken: string }>();
  private readonly actorId: string;
  private readonly cookieSecure: boolean;
  private readonly verifyPassword: LocalSessionOptions["verifyPassword"];

  public constructor(options: LocalSessionOptions) {
    this.actorId = options.actorId ?? "local-user";
    this.cookieSecure = options.cookieSecure ?? false;
    this.verifyPassword = options.verifyPassword;
  }

  public async login(password: string, response: ServerResponse): Promise<boolean> {
    if (!(await this.verifyPassword(password))) return false;
    const sessionId = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    this.sessions.set(sessionId, { actorId: this.actorId, csrfToken });
    response.setHeader("set-cookie", [this.cookie(SESSION_COOKIE, sessionId), this.cookie(CSRF_COOKIE, csrfToken, false)]);
    return true;
  }

  public logout(request: IncomingMessage, response: ServerResponse): void {
    const cookies = parseCookies(request.headers.cookie);
    if (cookies[SESSION_COOKIE]) this.sessions.delete(cookies[SESSION_COOKIE]);
    response.setHeader("set-cookie", [this.expiredCookie(SESSION_COOKIE), this.expiredCookie(CSRF_COOKIE, false)]);
  }

  public authenticate(request: IncomingMessage): { actorId: string; csrfToken: string } | undefined {
    const sessionId = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!sessionId) return undefined;
    return this.sessions.get(sessionId);
  }

  public csrfValid(request: IncomingMessage, session: { csrfToken: string }): boolean {
    const token = request.headers["x-citadel-csrf"];
    if (typeof token !== "string") return false;
    return safeEqual(token, session.csrfToken);
  }

  public static sessionCookieName(): string { return SESSION_COOKIE; }

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
