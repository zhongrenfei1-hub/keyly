import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, unseal } from "@/lib/token";

// 后台的第一道门：没登录的请求直接送去登录页。
// 这里只是提前拦一下，真正的校验在每个后台页面和 Server Action 里的 requireAdmin()。
export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === "/admin/login") return;
  if (!unseal("admin", req.cookies.get(ADMIN_COOKIE)?.value))
    return NextResponse.redirect(new URL("/admin/login", req.url));
}

export const config = { matcher: "/admin/:path*" };
