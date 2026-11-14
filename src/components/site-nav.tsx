"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand";

const LINKS = [
  { label: "商店", href: "/", match: /^\/($|p\/)/ },
  { label: "查订单", href: "/orders", match: /^\/order/ },
  { label: "兑换", href: "/redeem", match: /^\/redeem/ },
  { label: "售后", href: "/support", match: /^\/support/ },
];

/**
 * 顶部导航：一条浮在页面上的玻璃药丸，左边是标志，右边是分段切换（当前页是白色小药丸）。
 * pathname 传 null 表示还不知道当前在哪一页（预渲染外壳时），这时不高亮。
 * account 表示已经登录，最后一项从「登录」换成「我的」。
 */
export function SiteNav({
  pathname,
  account,
}: {
  pathname: string | null;
  account: boolean;
}) {
  const accountHref = account ? "/account" : "/login";
  const accountLabel = account ? "我的" : "登录";
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
      <div className="card-glass mx-auto flex h-14 max-w-[1080px] items-center justify-between rounded-full pr-1.5 pl-4 sm:pl-5">
        <Link href="/" aria-label="Keyly 首页">
          <Logo />
        </Link>
        <nav aria-label="主导航" className="seg max-[420px]:[&_a]:px-2">
          {LINKS.map(({ label, href, match }) => {
            const active = pathname !== null && match.test(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="seg-item"
              >
                {label}
              </Link>
            );
          })}
          <Link
            href={accountHref}
            aria-current={pathname !== null && /^\/(login|register|account)/.test(pathname) ? "page" : undefined}
            className="seg-item"
          >
            {accountLabel}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteNavLive({ account }: { account: boolean }) {
  return <SiteNav pathname={usePathname()} account={account} />;
}
