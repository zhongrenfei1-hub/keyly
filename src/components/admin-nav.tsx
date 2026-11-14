"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { label: "概览", href: "/admin", match: /^\/admin$/ },
  { label: "商品", href: "/admin/products", match: /^\/admin\/products/ },
  { label: "订单", href: "/admin/orders", match: /^\/admin\/orders/ },
  { label: "兑换码", href: "/admin/codes", match: /^\/admin\/codes/ },
  { label: "工单", href: "/admin/tickets", match: /^\/admin\/tickets/ },
  { label: "收支", href: "/admin/ledger", match: /^\/admin\/ledger/ },
  { label: "对账", href: "/admin/settlement", match: /^\/admin\/settlement/ },
];

/** pathname 传 null 表示还不知道当前在哪一页（预渲染外壳时），这时不高亮。 */
export function AdminNav({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
      {LINKS.map(({ label, href, match }) => {
        const active = pathname !== null && match.test(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-accent",
              active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminNavLive() {
  return <AdminNav pathname={usePathname()} />;
}
