import type { User } from "@shared/schema";

/**
 * Fields on the users table that are secrets/credentials and must NEVER be
 * serialized to a client: the ZKP commitment IS the login credential, and the
 * MCP token is a bearer token for the agent WebSocket protocol.
 */
const SECRET_USER_FIELDS = ["zkpCommitment", "mcpToken", "mcpTokenExpiry"] as const;

export type PublicUser = Omit<User, (typeof SECRET_USER_FIELDS)[number]>;

/** Strip secret credential fields from a user object before sending to clients. */
export function sanitizeUser<T extends Partial<User>>(
  user: T,
): Omit<T, (typeof SECRET_USER_FIELDS)[number]> {
  const clone: Record<string, unknown> = { ...user };
  for (const field of SECRET_USER_FIELDS) delete clone[field];
  return clone as Omit<T, (typeof SECRET_USER_FIELDS)[number]>;
}

/** Sanitize an array of users. */
export function sanitizeUsers(users: User[]): PublicUser[] {
  return users.map((u) => sanitizeUser(u));
}

/** Sanitize the nested user of a paper contributor row. */
export function publicContributor<C extends { user: User }>(c: C): Omit<C, "user"> & { user: PublicUser } {
  return { ...c, user: sanitizeUser(c.user) };
}
