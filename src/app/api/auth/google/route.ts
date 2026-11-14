import { NextResponse } from "next/server";
import { oauthState, requestOrigin } from "@/lib/social";

export async function GET(req: Request) {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/login?e=google", requestOrigin(req)));
  }
  const redirectUri = `${requestOrigin(req)}/api/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", oauthState("google"));
  url.searchParams.set("prompt", "select_account");
  return NextResponse.redirect(url);
}
