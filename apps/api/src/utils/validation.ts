const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a value is a standard RFC 4122 UUID string.
 */
export function isValidUUID(val: unknown): val is string {
  return typeof val === "string" && UUID_REGEX.test(val);
}

/**
 * Validates and sanitizes a string input.
 */
export function sanitizeString(val: unknown): string {
  if (typeof val !== "string") return "";
  return val.trim();
}
