import type { Metadata } from "next";

// 后台和登录页都不让搜索引擎收录
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminRoot({ children }: LayoutProps<"/admin">) {
  return children;
}
