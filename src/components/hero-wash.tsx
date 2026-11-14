"use client";

import { useEffect, useRef } from "react";

// 预览有时把整站挂在 /hds-…/ 下面。写成根路径时，视频会 404，首页就只剩原来的淡底。
const PREFIX = /^\/hds-[a-z0-9]+-\d+-[a-z0-9]+(?=\/|$)/i;

/** 原片贴着顶放，不拉满整屏。导航后面和对不齐的地方用模糊接上，底下渐变回浅底。 */
export function HeroWash() {
  const sharp = useRef<HTMLVideoElement>(null);
  const soft = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const prefix = PREFIX.exec(window.location.pathname)?.[0] ?? "";
    for (const video of [sharp.current, soft.current]) {
      if (!video) continue;
      video.poster = `${prefix}/home-bg-2.jpg`;
      video.src = `${prefix}/home-bg-2.mp4`;
      video.play().catch(() => {});
    }
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-[4.25rem] h-svh overflow-hidden">
      <video ref={soft} className="absolute inset-0 size-full scale-110 object-cover blur-2xl" autoPlay muted loop playsInline preload="auto" />
      <video
        ref={sharp}
        className="absolute inset-x-0 top-0 h-[86%] w-full origin-top object-cover object-top [mask-image:linear-gradient(to_bottom,#000_68%,transparent_100%)]"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-b from-transparent to-[#f4f6f8]" />
    </div>
  );
}
