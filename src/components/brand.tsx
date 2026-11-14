"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const PREFIX = /^\/hds-[a-z0-9]+-\d+-[a-z0-9]+(?=\/|$)/i;

/** 几何 K，形状按那张参考图来。蓝色往站点这边挪了一点。mono 时跟着文字色。 */
export function LogoMark({ className, mono }: { className?: string; mono?: boolean }) {
  const [src, setSrc] = useState("/brand-k.png");

  useEffect(() => {
    const prefix = PREFIX.exec(window.location.pathname)?.[0] ?? "";
    setSrc(`${prefix}/brand-k.png`);
  }, []);

  return (
    <span
      aria-hidden
      className={cn("inline-block size-6 shrink-0", mono && "bg-current", className)}
      style={{
        backgroundImage: mono ? undefined : "linear-gradient(120deg, #3F7BB9 0%, #9BB4DC 46%, #F6E6C4 100%)",
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        maskSize: "contain",
        WebkitMaskSize: "contain",
      }}
    />
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 font-sans text-[18px] font-semibold leading-none tracking-[-0.04em]", className)}>
      <LogoMark className="size-5 -translate-y-px" />
      Keyly
    </span>
  );
}

/** 页面内容的统一宽度和左右留白。整屏的色带放在它外面，内容放在它里面。 */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1080px] px-5 sm:px-6", className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-card bg-black/[0.06]", className)} />;
}
