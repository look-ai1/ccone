import { createHmac, timingSafeEqual } from "node:crypto";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  isSuperAdmin: boolean;
  memberships: Array<{ storeId: string; role: string; permissions: string[] }>;
  exp: number;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error("JWT_SECRET is not set");
  return value;
}

export function signToken(payload: Omit<AuthTokenPayload, "exp">, ttlSeconds = 60 * 60 * 12) {
  const fullPayload: AuthTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): AuthTokenPayload | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) {
    return null;
  }
  const expected = createHmac("sha256", secret()).update(`${header}.${body}`).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }
  const payload = JSON.parse(base64UrlDecode(body)) as AuthTokenPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}
