/**
 * Converts all Date objects to ISO strings so Zod schemas expecting `string` can parse DB results.
 */
export function serialize<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
