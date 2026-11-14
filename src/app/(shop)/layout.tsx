import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav, SiteNavLive } from "@/components/site-nav";
import { SourceTracker } from "@/components/source-field";
import { SupportChat } from "@/components/support-chat";
import { FAQ } from "@/lib/faq";
import { currentUser } from "@/lib/guard";

async function Nav() {
  const user = await currentUser();
  return <SiteNavLive account={Boolean(user)} />;
}

export default function ShopLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="page-backdrop flex min-h-dvh flex-col">
      <SourceTracker />
      {/* 当前页高亮要读路径，登录状态要读 cookie，动态路由下得包一层 Suspense */}
      <Suspense fallback={<SiteNav pathname={null} account={false} />}>
        <Nav />
      </Suspense>
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
      {/* 右下角的客服对话框，前台每一页都有。常见问题从这里传进去，和首页共用一份 */}
      <SupportChat faq={FAQ} />
    </div>
  );
}
