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

/**
 * Safely truncates a string to at most `maxGraphemes` without cutting through
 * Unicode surrogate pairs or combining grapheme clusters.
 */
export function truncateUnicode(str: string, maxGraphemes = 150): string {
  if (!str) return "";

  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let result = "";
    let count = 0;

    for (const { segment } of segmenter.segment(str)) {
      if (count >= maxGraphemes) break;
      result += segment;
      count++;
    }
    return result;
  }

  // Fallback: code-point iteration preserves surrogate pairs
  const codePoints = Array.from(str);
  return codePoints.slice(0, maxGraphemes).join("");
}

/**
 * Normalizes an arbitrary document title or path into a safe, clean base filename.
 * 1. Strips Windows drive letters (e.g. C:, D:).
 * 2. Strips leading directory paths across POSIX and Windows separators (/ and \).
 * 3. Replaces any remaining path separators (/ and \) with underscores.
 * 4. Strips non-printable control characters, CR, and LF to prevent header/terminal injection.
 * 5. Strips leading and trailing dots and whitespace in a single combined step.
 * 6. Truncates cleanly at Unicode grapheme cluster boundaries without splitting surrogate pairs.
 * 7. Re-applies edge dot/whitespace cleanup if truncation ended on an edge character.
 * 8. Preserves valid Unicode characters for UTF-8 presentation.
 * 9. Falls back to "download" if the resulting name is empty or only whitespace/dots.
 */
export function normalizeFilename(rawTitle: unknown, maxGraphemes = 150): string {
  if (typeof rawTitle !== "string") return "download";

  const withoutDrive = rawTitle.replace(/^[a-zA-Z]:/, "");
  const withoutPath = withoutDrive.replace(/^.*[\\/]/, "");
  const withoutSeparators = withoutPath
    .replace(/[\\/]/g, "_")
    .replace(/[\x00-\x1f\x7f]/g, "");

  // Remove leading and trailing dots and whitespace together in one step
  const edgeCleaned = withoutSeparators.replace(/^[\s.]+|[\s.]+$/g, "");

  // Truncate without splitting Unicode surrogate pairs or graphemes
  const truncated = truncateUnicode(edgeCleaned, maxGraphemes);

  // If truncation ends on a dot or space, clean edges again in one step
  const finalCleaned = truncated.replace(/^[\s.]+|[\s.]+$/g, "");

  return finalCleaned || "download";
}

/**
 * Sanitizes a filename, stripping directory traversal patterns, control characters,
 * and dangerous symbols.
 */
export function sanitizeFilename(raw: unknown): string {
  const normalized = normalizeFilename(raw);
  const sanitized = normalized.replace(/[<>:"/\\|?*;=]/g, "_");
  return sanitized.replace(/^[\s.]+|[\s.]+$/g, "") || "download";
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const MULTIPART_LIMITS = {
  fileSize: MAX_FILE_SIZE_BYTES, // 10 MB
  files: 1,                      // Exactly 1 file
  fields: 10,                    // Max 10 non-file fields
  parts: 20,                     // Max 20 parts total (fields + files)
  fieldSize: 64 * 1024,          // 64 KB max per field value
  fieldNameSize: 100,            // 100 bytes max per field name
};

export const MAX_ENCODED_FILENAME_LEN = 800;
export const MAX_CONTENT_DISPOSITION_LEN = 2000;

function encodeRFC5987(str: string): string {
  return encodeURIComponent(str).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Builds an RFC 6266 and RFC 5987 compliant Content-Disposition header value.
 * Derives both the ASCII fallback and the UTF-8 percent-encoded filename* from a
 * commonly normalized filename that has all path separators and traversal components stripped.
 * Strips CR, LF, and control characters to prevent HTTP response splitting.
 * Guarantees the total encoded header remains safely within standard reverse-proxy limits (<2 KB),
 * even when a single grapheme cluster exceeds the remaining length budget.
 */
export function buildContentDisposition(rawTitle: string): string {
  let normalized = normalizeFilename(rawTitle);
  let rfc5987Encoded = encodeRFC5987(normalized);

  // If percent-encoded representation exceeds MAX_ENCODED_FILENAME_LEN due to multi-byte sequences,
  // iterate whole grapheme clusters and keep only graphemes that completely fit.
  // If the next complete grapheme cannot fit within the limit (including when a single grapheme cluster
  // exceeds the entire budget), safely fall back to "download" rather than producing an oversized header
  // or splitting a grapheme.
  if (rfc5987Encoded.length > MAX_ENCODED_FILENAME_LEN) {
    const segmenter =
      typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;

    const graphemes: string[] = segmenter
      ? Array.from(segmenter.segment(normalized), (s) => s.segment)
      : Array.from(normalized);

    let accumulated = "";
    for (const g of graphemes) {
      const candidate = accumulated + g;
      const candidateCleaned = candidate.replace(/^[\s.]+|[\s.]+$/g, "");
      if (!candidateCleaned) continue;
      const candidateEncoded = encodeRFC5987(candidateCleaned);
      if (candidateEncoded.length > MAX_ENCODED_FILENAME_LEN) {
        // The next complete grapheme cannot fit within the length budget; stop here.
        break;
      }
      accumulated = candidate;
    }

    normalized = accumulated.replace(/^[\s.]+|[\s.]+$/g, "");
    rfc5987Encoded = encodeRFC5987(normalized);

    // If even the first complete grapheme could not fit within the limit (e.g. an unusually large
    // grapheme cluster with hundreds of combining marks) or the result is empty, fall back safely.
    if (!normalized || rfc5987Encoded.length > MAX_ENCODED_FILENAME_LEN) {
      normalized = "download";
      rfc5987Encoded = encodeRFC5987(normalized);
    }
  }

  // Safe ASCII fallback: replace non-ASCII characters, quotes, backslashes, semicolons with underscore
  const asciiFallback = normalized
    .replace(/[^\x20-\x7e]/gu, "_")
    .replace(/["\\;=]/g, "_")
    .replace(/^[\s.]+|[\s.]+$/g, "") || "download";

  const header = `attachment; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987Encoded}`;

  // Hard safety invariant: guarantee header never exceeds MAX_CONTENT_DISPOSITION_LEN
  if (header.length > MAX_CONTENT_DISPOSITION_LEN) {
    return 'attachment; filename="download"; filename*=UTF-8\'\'download';
  }

  return header;
}

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
]);

/**
 * Validates file buffer content, size, and magic byte signatures.
 *
 * NOTE: Magic-byte inspection verifies that file headers correspond to their declared
 * formats (preventing MIME type spoofing). It does NOT constitute comprehensive anti-virus
 * or malware scanning.
 */
export function validateFileContent(
  buffer: Buffer,
  declaredMimeType: string
): { isValid: boolean; error?: string; detectedMimeType?: string; extension?: string } {
  if (!buffer || buffer.length === 0) {
    return { isValid: false, error: "Uploaded file is empty (0 bytes)" };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds the maximum allowed limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
    };
  }

  const normalizedMime = (declaredMimeType || "").toLowerCase().trim();

  // 1. PDF signature: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (normalizedMime === "application/pdf") {
    if (
      buffer.length >= 5 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46 &&
      buffer[4] === 0x2d
    ) {
      return { isValid: true, detectedMimeType: "application/pdf", extension: "pdf" };
    }
    return { isValid: false, error: "File content does not match valid PDF signature" };
  }

  // 2. PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (normalizedMime === "image/png") {
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return { isValid: true, detectedMimeType: "image/png", extension: "png" };
    }
    return { isValid: false, error: "File content does not match valid PNG signature" };
  }

  // 3. JPEG signature: FF D8 FF
  if (normalizedMime === "image/jpeg" || normalizedMime === "image/jpg") {
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return { isValid: true, detectedMimeType: "image/jpeg", extension: "jpg" };
    }
    return { isValid: false, error: "File content does not match valid JPEG signature" };
  }

  // 4. WebP signature: RIFF....WEBP
  if (normalizedMime === "image/webp") {
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return { isValid: true, detectedMimeType: "image/webp", extension: "webp" };
    }
    return { isValid: false, error: "File content does not match valid WebP signature" };
  }

  // 5. Plain text or CSV: must be valid UTF-8 and contain no binary null bytes
  if (normalizedMime === "text/plain" || normalizedMime === "text/csv") {
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      // Disallow null bytes and non-printable control characters (except tab, LF, CR)
      if (byte === 0x00 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) {
        return { isValid: false, error: "Text file contains binary or invalid control characters" };
      }
    }

    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      decoder.decode(buffer);
      return {
        isValid: true,
        detectedMimeType: normalizedMime,
        extension: normalizedMime === "text/csv" ? "csv" : "txt",
      };
    } catch {
      return { isValid: false, error: "Text file is not valid UTF-8" };
    }
  }

  return {
    isValid: false,
    error: `Unsupported or disallowed MIME type '${declaredMimeType}'. Allowed: PDF, PNG, JPEG, WebP, TXT, CSV`,
  };
}
