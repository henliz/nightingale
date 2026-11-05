import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";
import { HttpError } from "./http-error.js";

export type ApiPermission = "ingest" | "read" | "audit" | "admin";

export interface ApiPrincipal {
  actorId: string;
  actorRole: string;
  permissions: readonly ApiPermission[];
}

export interface ApiKey {
  id: string;
  secret: string;
  actorId: string;
  actorRole: string;
  permissions: readonly ApiPermission[];
}

export interface ApiSecurityConfig {
  /** When false, the test factory may use the legacy actor headers. */
  requireAuth?: boolean;
  keys?: readonly ApiKey[];
  /** Only intended for local tests; never enable in a deployed server. */
  allowLegacyHeaders?: boolean;
}

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function principalFromRequest(c: Context, config: ApiSecurityConfig): ApiPrincipal {
  const authorization = c.req.header("authorization");
  const presented = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? c.req.header("x-api-key");
  const key = presented && (config.keys ?? []).find((candidate) => equalSecret(candidate.secret, presented));
  if (key) {
    return { actorId: key.actorId, actorRole: key.actorRole, permissions: key.permissions };
  }

  if (config.allowLegacyHeaders && !config.requireAuth) {
    return {
      actorId: c.req.header("x-actor-id") ?? "unknown",
      actorRole: c.req.header("x-actor-role") ?? "unknown",
      permissions: ["ingest", "read", "audit", "admin"],
    };
  }

  throw new HttpError(401, "authentication required");
}

export function requirePermission(principal: ApiPrincipal, permission: ApiPermission) {
  if (!principal.permissions.includes(permission)) throw new HttpError(403, "insufficient permission");
}

export function securityHeaders(c: Context) {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
}

export function authMiddleware(config: ApiSecurityConfig, permission: ApiPermission) {
  return async (c: Context, next: Next) => {
    const principal = principalFromRequest(c, config);
    requirePermission(principal, permission);
    c.set("principal", principal);
    await next();
  };
}
