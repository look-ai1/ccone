import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const ITERATIONS = 120_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST).toString("hex");
  return `pbkdf2$${ITERATIONS}$${salt}$${key}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [scheme, iterationsText, salt, expected] = storedHash.split("$");
  if (scheme !== "pbkdf2" || !iterationsText || !salt || !expected) {
    return false;
  }
  const actual = pbkdf2Sync(password, salt, Number(iterationsText), KEY_LENGTH, DIGEST);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}
