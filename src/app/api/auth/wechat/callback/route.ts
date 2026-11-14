import { NextResponse } from "next/server";
import { signInUser } from "@/lib/guard";
import { readOauthState, requestOrigin, upsertOAuthUser } from "@/lib/social";

export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const back = (code: string) => NextResponse.redirect(new URL(`/login?e=${code}`, origin));
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !readOauthState(state, "wechat")) return back("failed");

  const appid = process.env.WECHAT_APP_ID;
  const secret = process.env.WECHAT_APP_SECRET;
  if (!appid || !secret) return back("wechat");

  const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  tokenUrl.searchParams.set("appid", appid);
  tokenUrl.searchParams.set("secret", secret);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  const tokenRes = await fetch(tokenUrl);
  if (!tokenRes.ok) return back("failed");
  const token = (await tokenRes.json()) as { openid?: string; unionid?: string; errcode?: number };
  const id = token.unionid || token.openid;
  if (!id || token.errcode) return back("failed");

  const user = upsertOAuthUser("wechat", id, `wx_${id}@weixin`);
  await signInUser(user);
  return NextResponse.redirect(new URL("/account", origin));
}
