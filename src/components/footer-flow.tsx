"use client";

import { useEffect, useRef } from "react";

// 预览有时把整站挂在 /hds-…/ 下面。写成根路径时，视频和封面会 404，卡片就只剩原来的蓝。
const PREFIX = /^\/hds-[a-z0-9]+-\d+-[a-z0-9]+(?=\/|$)/i;

export function FooterFlow() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const prefix = PREFIX.exec(window.location.pathname)?.[0] ?? "";
    const card = video.parentElement;
    if (card) card.style.backgroundImage = `url("${prefix}/footer-flow.jpg?v=5")`;
    video.poster = `${prefix}/footer-flow.jpg?v=5`;
    video.src = `${prefix}/footer-flow.mp4?v=5`;
    video.play().catch(() => {});
  }, []);

  return (
    <video
      ref={ref}
      className="ft-flow"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
    />
  );
}
