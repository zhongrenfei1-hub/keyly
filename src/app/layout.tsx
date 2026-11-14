import type { Metadata, Viewport } from "next";
import { Caveat, IBM_Plex_Mono, Inter, Newsreader } from "next/font/google";
import { SITE } from "@/lib/site";
import "./globals.css";

// 三套西文字体：构建时由 next/font 下载并打包进站里，上线后浏览器不向 Google 发请求。
// 构建的机器连不上 Google 时，改用 npm 上的 @fontsource 字体包加 next/font/local（见 docs/改版-定法.md「字体」）。
// 这里只定义 CSS 变量，哪里用哪套字体写在 globals.css 的 --font-sans / --font-serif / --font-mono 里。
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const newsreader = Newsreader({ subsets: ["latin"], axes: ["opsz"], variable: "--font-newsreader" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});
// 手写英文点缀。首页首屏也会用到，所以要预加载，别等滚到底才跳出字体。
const caveat = Caveat({ subsets: ["latin"], variable: "--font-caveat" });

export const metadata: Metadata = {
  title: { default: `${SITE.name} · ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: "自助下单，付款后自动发货，订单随时可查。",
};

export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} ${newsreader.variable} ${plexMono.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
