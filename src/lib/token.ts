// 带签名、带过期时间的小令牌：后台登录状态、订单访问凭证、模拟支付通知都用它。
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "keyly_admin";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new Error("请设置环境变量 SESSION_SECRET（至少 32 位随机字符）");
  return s;
}

const mac = (kind: string, body: string) =>
  createHmac("sha256", secret()).update(`${kind}.${body}`).digest("base64url");

/** kind 把不同用途的令牌隔开：拿一种令牌冒充不了另一种 */
export function seal(kind: string, data: object, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = Buffer.from(JSON.stringify({ ...data, exp })).toString("base64url");
  return `${body}.${mac(kind, body)}`;
}

/** 签名不对、过期、格式坏了都返回 null */
export function unseal<T>(kind: string, token: string | null | undefined): T | null {
  const [body, sig] = (token ?? "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(kind, body));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    return data.exp > Date.now() / 1000 ? (data as T) : null;
  } catch {
    return null;
  }
}
