"use client";

import { useEffect, useRef } from "react";
import type { Brand } from "@/lib/brand";

const PREFIX = /^\/hds-[a-z0-9]+-\d+-[a-z0-9]+(?=\/|$)/i;

const FILE: Record<Brand, string> = {
  claude: "claude-bg",
  gpt: "openai-bg",
  grok: "grok-bg",
  codex: "codex-bg",
  muse: "muse-bg",
};

/** 每个 AI 自己的慢光。card 铺满商品卡，page 铺在商品页顶上再淡出去。 */
export function BrandWash({ brand, variant }: { brand: Brand; variant: "card" | "page" }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const prefix = PREFIX.exec(window.location.pathname)?.[0] ?? "";
    video.poster = `${prefix}/brands/${FILE[brand]}.jpg?v=3`;
    video.src = `${prefix}/brands/${FILE[brand]}.mp4?v=3`;
    video.play().catch(() => {});
  }, [brand]);

  return (
    <div
      aria-hidden
      className={
        variant === "card"
          ? "pointer-events-none absolute inset-0"
          : brand === "claude"
            ? "pointer-events-none absolute -top-10 left-1/2 h-[820px] w-screen -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_46%,transparent)]"
            : "pointer-events-none absolute -top-16 left-1/2 h-[640px] w-screen -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_18%,transparent_88%)]"
      }
    >
      <video
        ref={ref}
        className={
          brand === "claude" || variant === "page" ? "size-full object-cover" : "size-full object-fill"
        }
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      />
    </div>
  );
}
