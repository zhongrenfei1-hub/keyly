import { NextResponse } from "next/server";
import { signInUser } from "@/lib/guard";
import { readOauthState, requestOrigin, upsertOAuthUser } from "@/lib/social";

export async function GET(req: Request) {
  const origin = requestOrigin(req);
  const back = (code: string) => NextResponse.redirect(new URL(`/login?e=${code}`, origin));
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("denied");
  if (!code || !readOauthState(state, "google")) return back("failed");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !secret) return back("google");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: secret,
      redirect_uri: `${origin}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return back("failed");
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return back("failed");

  const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!profileRes.ok) return back("failed");
  const profile = (await profileRes.json()) as { sub?: string; email?: string; email_verified?: boolean };
  if (!profile.sub || !profile.email || profile.email_verified === false) return back("failed");

  const user = upsertOAuthUser("google", profile.sub, profile.email.trim().toLowerCase());
  await signInUser(user);
  return NextResponse.redirect(new URL("/account", origin));
}
