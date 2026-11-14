// 买家账号：注册、核对密码。不管 cookie，登录状态在 guard.ts。
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { get, run } from "./db.ts";

export class AccountError extends Error {}

export type User = { id: number; email: string; password_hash: string; created_at: number };

const DUMMY_HASH = hashPassword("keyly-timing-padding");

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(password, salt, 32).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const got = scryptSync(password, salt, 32);
  const want = Buffer.from(hash, "base64url");
  if (got.length !== want.length) return false;
  return timingSafeEqual(got, want);
}

export function findUserByEmail(email: string): User | undefined {
  return get<User>(`SELECT * FROM users WHERE email = ?`, email);
}

/** 邮箱已存在时抛 AccountError。邮箱必须已经是小写。 */
export function createUser(email: string, password: string): { id: number; email: string } {
  try {
    const id = Number(
      run(
        `INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)`,
        email,
        hashPassword(password),
        Date.now(),
      ).lastInsertRowid,
    );
    return { id, email };
  } catch (e) {
    if (String(e).includes("UNIQUE")) throw new AccountError("这个邮箱已经注册过了");
    throw e;
  }
}

/** 对不上时返回 null。没有这个邮箱也会做一次哈希，避免靠响应时间判断邮箱是否存在。 */
export function authenticate(email: string, password: string): { id: number; email: string } | null {
  const user = findUserByEmail(email);
  const ok = verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) return null;
  return { id: user.id, email: user.email };
}
