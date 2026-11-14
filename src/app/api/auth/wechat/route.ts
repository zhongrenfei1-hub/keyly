import { NextResponse } from "next/server";
import { oauthState, requestOrigin } from "@/lib/social";

export async function GET(req: Request) {
  const appid = process.env.WECHAT_APP_ID;
  if (!appid || !process.env.WECHAT_APP_SECRET) {
    return NextResponse.redirect(new URL("/login?e=wechat", requestOrigin(req)));
  }
  const redirectUri = `${requestOrigin(req)}/api/auth/wechat/callback`;
  const url = new URL("https://open.weixin.qq.com/connect/qrconnect");
  url.searchParams.set("appid", appid);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "snsapi_login");
  url.searchParams.set("state", oauthState("wechat"));
  url.hash = "wechat_redirect";
  return NextResponse.redirect(url);
}
