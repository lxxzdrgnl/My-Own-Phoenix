import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): string {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) throw new Error("ENCRYPTION_SECRET env var is required");
  return secret;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const salt = randomBytes(16);
  const derivedKey = scryptSync(key, salt, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // New 4-part format: salt:iv:authTag:encrypted
  return [salt, iv, authTag, encrypted].map(b => b.toString("base64")).join(":");
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const parts = encoded.split(":");

  if (parts.length === 3) {
    // Legacy format: iv:authTag:encrypted (hardcoded salt "salt")
    const derivedKey = scryptSync(key, "salt", 32);
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");
    const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  }

  // New 4-part format: salt:iv:authTag:encrypted
  const [saltB64, ivB64, tagB64, dataB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const derivedKey = scryptSync(key, salt, 32);
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(dataB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function maskApiKey(key: string): string {
  if (key.length <= 6) return "••••••";
  return key.slice(0, 3) + "•••" + key.slice(-3);
}
