import Link from "next/link";
import { Logo } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="page-backdrop grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <Logo className="justify-center" />
        <h1 className="mt-10 type-serif type-headline">
          这一页不存在。
        </h1>
        <p className="mt-3 type-body text-muted-foreground">链接可能写错了，或者商品已经下架。</p>
        <Link href="/" className={buttonClass({ variant: "brand", size: "xl", className: "mt-8" })}>
          回到商店
        </Link>
      </div>
    </main>
  );
}
