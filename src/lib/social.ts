// 谷歌、微信登录。密钥不在代码里：没配的话开始登录会回到登录页说明原因。
import { randomBytes } from "node:crypto";
import { hashPassword } from "./account.ts";
import { get, run } from "./db.ts";
import { seal, unseal } from "./token.ts";

export type Provider = "google" | "wechat";

const STATE_TTL = 10 * 60;

export function oauthState(provider: Provider) {
  return seal("oauth", { provider }, STATE_TTL);
}

export function readOauthState(token: string | null, provider: Provider) {
  const data = unseal<{ provider?: string }>("oauth", token);
  return data?.provider === provider;
}

export function requestOrigin(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function upsertOAuthUser(provider: Provider, providerId: string, email: string) {
  const linked = get<{ id: number; email: string }>(
    `SELECT id, email FROM users WHERE provider = ? AND provider_id = ?`,
    provider,
    providerId,
  );
  if (linked) return linked;

  const byEmail = get<{ id: number; email: string; provider: string }>(
    `SELECT id, email, provider FROM users WHERE email = ?`,
    email,
  );
  if (byEmail) {
    if (!byEmail.provider)
      run(`UPDATE users SET provider = ?, provider_id = ? WHERE id = ?`, provider, providerId, byEmail.id);
    return { id: byEmail.id, email: byEmail.email };
  }

  const id = Number(
    run(
      `INSERT INTO users (email, password_hash, created_at, provider, provider_id) VALUES (?, ?, ?, ?, ?)`,
      email,
      hashPassword(randomBytes(24).toString("base64url")),
      Date.now(),
      provider,
      providerId,
    ).lastInsertRowid,
  );
  return { id, email };
}
