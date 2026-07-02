// ── Private key normalizer ──────────────────────────────────────────────

/** Regex to match any PEM boundary line — both BEGIN and END markers. */
const PEM_BOUNDARY_RE = /^-{2,}(?:BEGIN|END)\s.{1,70}PRIVATE\sKEY-{2,}\s*/gim;

/**
 * Normalize a pasted private key into a clean PEM format.
 *
 * Steps:
 *  1. Trim whitespace and normalize line endings to LF.
 *  2. Detect the key type from the BEGIN header (defaults to OPENSSH).
 *  3. Strip all PEM boundary lines (BEGIN + END).
 *  4. Remove all whitespace from the base64 body.
 *  5. Validate that only base64 characters remain.
 *  6. Re-wrap at 64 characters per line.
 *  7. Reconstruct with proper PEM envelope.
 *
 * @returns Normalized PEM string, or empty string if input is invalid.
 */
export function normalizePrivateKey(raw: string): string {
  // Step 1: trim and normalize line endings
  let text = raw.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Step 2: detect key type from header
  const firstLine = text.split("\n")[0] || "";
  const headerMatch = firstLine.match(/-{2,}BEGIN\s(.{1,70}PRIVATE\sKEY)-{2,}/i);
  const keyType = headerMatch ? headerMatch[1] : "OPENSSH PRIVATE KEY";

  // Step 3: strip PEM boundary lines
  // Step 4: remove all whitespace from base64 content
  const body = text.replace(PEM_BOUNDARY_RE, "").replace(/\s+/g, "");

  if (body.length === 0) return "";

  // Only allow valid base64 characters
  if (!/^[A-Za-z0-9+/=]+$/.test(body)) return "";

  // Step 6: re-wrap at 64 chars per line
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;

  // Step 7: reconstruct with proper PEM envelope
  return `-----BEGIN ${keyType}-----\n${wrapped}\n-----END ${keyType}-----`;
}
