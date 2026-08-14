import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scrypt(password, salt, KEYLEN)) as Buffer;
  return `scrypt:${salt}:${buf.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [algo, salt, hash] = stored.split(":");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const buf = (await scrypt(password, salt, KEYLEN)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== buf.length) return false;
  return timingSafeEqual(expected, buf);
}
