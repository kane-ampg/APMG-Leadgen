/**
 * Shared caps for the portal chat, safe to import from BOTH client and server.
 *
 * These are plain constants (no server-only APIs) so the chat bubble
 * (components/apmg/PortalChat.tsx, a client component) can mirror the same
 * length/turn limits the route enforces server-side — without pulling the
 * server-only rate limiter into the browser bundle. The limiter itself and the
 * IP helper live in lib/portal/chatRateLimit.ts (server-only).
 */

/** Longest single visitor message we'll forward to the model. */
export const MAX_MESSAGE_CHARS = 1000;
/** Most prior turns (user+assistant messages) we keep as context. Older ones are
 *  dropped client- and server-side so a caller can't grow the prompt unbounded. */
export const MAX_HISTORY_MESSAGES = 12;
/** Cap on the model's reply — a short support answer, never an essay. */
export const MAX_OUTPUT_TOKENS = 400;

/** Max messages one IP may send inside RATE_WINDOW_MS. */
export const RATE_LIMIT = 15;
/** Sliding window for RATE_LIMIT (10 minutes). */
export const RATE_WINDOW_MS = 10 * 60 * 1000;
