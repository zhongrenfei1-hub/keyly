"use client";

import { useEffect, useRef } from "react";
import { brandOf } from "@/lib/brand";

// 预览有时把整站挂在 /hds-…/ 下面。写成根路径时，标志会 404。
const PREFIX = /^\/hds-[a-z0-9]+-\d+-[a-z0-9]+(?=\/|$)/i;

const FILE = {
  claude: "claude.svg",
  gpt: "openai.svg",
  grok: "grok.png",
  codex: "openai.svg",
  muse: "muse.svg",
} as const;

/** 货架上认得出的几家。标志是网上的素材，不是手画的。 */
export function ProductMark({ name }: { name: string }) {
  const brand = brandOf(name);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (!img || !brand) return;
    const prefix = PREFIX.exec(window.location.pathname)?.[0] ?? "";
    img.src = `${prefix}/brands/${FILE[brand]}`;
  }, [brand]);

  if (!brand) return null;
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white ring-1 ring-black/8">
      <img
        ref={ref}
        alt=""
        src={`/brands/${FILE[brand]}`}
        className={brand === "grok" ? "size-9 object-contain" : "size-7 object-contain"}
      />
    </span>
  );
}
