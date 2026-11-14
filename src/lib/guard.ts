// 跟请求有关的守卫：后台登录状态、订单访问凭证、限流、站点地址。
import { io } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, timingSafeEqual } from "node:crypto";
import { ADMIN_COOKIE, seal, unseal } from "./token.ts";

const USER_COOKIE = "keyly_user";
const ORDERS_COOKIE = "keyly_orders";
const DAY = 86400;

// 生产环境的 cookie 只走 HTTPS，所以正式站必须上证书
const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

// ── 后台登录 ──────────────────────────────────────────────

export function checkAdminPassword(input: string): boolean {
  const want = process.env.ADMIN_PASSWORD;
  if (!want) throw new Error("请设置环境变量 ADMIN_PASSWORD");
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(input), digest(want));
}

export async function signInAdmin() {
  (await cookies()).set(ADMIN_COOKIE, seal("admin", {}, 7 * DAY), {
    ...cookieBase,
    maxAge: 7 * DAY,
  });
}

export async function signOutAdmin() {
  (await cookies()).delete(ADMIN_COOKIE);
}

/** 每个后台页面、每个后台 Server Action 的第一行都要调它。 */
export async function requireAdmin() {
  await io(); // 登录状态每次请求现查，不进预渲染和预取
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!unseal("admin", token)) redirect("/admin/login");
}

// ── 买家账号 ──────────────────────────────────────────────

type UserToken = { id: number; email: string };

export async function currentUser(): Promise<{ id: number; email: string } | null> {
  await io();
  const data = unseal<UserToken>("user", (await cookies()).get(USER_COOKIE)?.value);
  if (!data?.id || !data.email) return null;
  return { id: data.id, email: data.email };
}

export async function signInUser(user: { id: number; email: string }) {
  (await cookies()).set(USER_COOKIE, seal("user", { id: user.id, email: user.email }, 30 * DAY), {
    ...cookieBase,
    maxAge: 30 * DAY,
  });
}

export async function signOutUser() {
  (await cookies()).delete(USER_COOKIE);
}

// ── 订单访问凭证 ──────────────────────────────────────────
// 下单、兑换、或用「订单号 + 邮箱」验证过的订单号记在签名 cookie 里。
// 登录后，下单邮箱和账号邮箱相同的订单也能看。

type OrdersToken = { o: string[] };

async function grantedOrders(): Promise<string[]> {
  await io();
  const token = (await cookies()).get(ORDERS_COOKIE)?.value;
  return unseal<OrdersToken>("orders", token)?.o ?? [];
}

export async function grantOrder(no: string) {
  const o = [no, ...(await grantedOrders()).filter((x) => x !== no)].slice(0, 20);
  (await cookies()).set(ORDERS_COOKIE, seal("orders", { o }, 30 * DAY), {
    ...cookieBase,
    maxAge: 30 * DAY,
  });
}

export async function canViewOrder(no: string) {
  return (await grantedOrders()).includes(no);
}

// ── 限流 ──────────────────────────────────────────────────
// ponytail: 计数放在进程内存里，重启清零、多进程不共享；上多实例时换成数据库或 Redis。
// IP 取自 X-Forwarded-For：前面有反向代理时要让代理覆盖这个头，否则可以伪造。

const hits = new Map<string, number[]>();

/** 同一个 IP 在 windowMinutes 分钟内最多做 max 次 action；超了返回 false。 */
export async function throttle(action: string, max: number, windowMinutes: number) {
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const key = `${action}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(
    (t) => now - t < windowMinutes * 60_000,
  );
  if (recent.length >= max) return false;
  if (hits.size > 10_000) hits.clear();
  hits.set(key, [...recent, now]);
  return true;
}

// ── 站点地址 ──────────────────────────────────────────────

/** 拼支付回调地址用。生产环境请设置 SITE_URL，不要依赖请求头。 */
export async function origin(): Promise<string> {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
