import { Suspense } from "react";
import Link from "next/link";
import { ExternalLink, LogOut } from "lucide-react";
import { logout } from "@/app/admin/actions";
import { AdminNav, AdminNavLive } from "@/components/admin-nav";
import { Logo } from "@/components/brand";

// 这里不读登录状态：没登录的请求已经被 proxy.ts 挡在外面，
// 每个页面取数据前还会各自 requireAdmin() 一次。
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6">
          <Link href="/admin" className="flex shrink-0 items-center gap-2">
            <Logo />
            <span className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-medium text-accent-foreground">
              后台
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <Suspense fallback={<AdminNav pathname={null} />}>
              <AdminNavLive />
            </Suspense>
          </div>
          <Link
            href="/"
            target="_blank"
            className="hidden items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground sm:flex"
          >
            <ExternalLink className="size-4" />
            看店铺
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">退出</span>
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
