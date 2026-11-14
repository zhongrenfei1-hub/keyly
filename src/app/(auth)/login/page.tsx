import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BuyerAuthScreen } from "@/components/buyer-auth-screen";
import { currentUser } from "@/lib/guard";

export const metadata = { title: "登录" };

const HINT: Record<string, string> = {
  google: "谷歌登录还没配好应用。需要 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET。",
  wechat: "微信登录还没配好开放平台网站应用。需要 WECHAT_APP_ID 和 WECHAT_APP_SECRET。",
  denied: "你取消了这次登录。",
  failed: "登录没有完成，请再试一次。",
};

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ e?: string | string[] }>;
}) {
  return (
    <Suspense fallback={null}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: { searchParams: Promise<{ e?: string | string[] }> }) {
  if (await currentUser()) redirect("/account");
  const { e } = await searchParams;
  const code = Array.isArray(e) ? e[0] : e;
  return <BuyerAuthScreen mode="login" error={code ? (HINT[code] ?? HINT.failed) : undefined} />;
}
