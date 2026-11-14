"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { brandOf, type Brand } from "@/lib/brand";
import "./delivery-belt.css";

/**
 * 首页首屏的传送带：商品卡从右往左走，过了中间那条「付款」线就溶成粒子，
 * 线的左边露出这件商品发货后买家拿到的东西（示意，不是真实卡密）。
 * 结构和动效数值照 docs/参考-Distill-传送带设计稿.md，颜色换成站里的天蓝色系。
 * 卡片是 DOM，溶解是一张 canvas，全部由下面 effect 里的一个 rAF 循环驱动。
 */
export type BeltCard = {
  id: number;
  name: string;
  category: string;
  /** 商品说明的第一句 */
  blurb: string;
  /** 已经格式化好的价格，例如 ¥99.00 */
  price: string;
  /** 0 白底、1 深色底、2 天蓝底 */
  theme: number;
  /** 站外付款的商品：本站不生成订单，示意文字里不写订单号 */
  external: boolean;
};

// 卡片宽、高、间距、圆角，和代码层左侧淡出的宽度。手机用稿子的移动端变量。
// 高度跟着卡片走：上下各留 70px 给计数胶囊、线的出头和溢出的粒子。
const FRAME =
  "relative mt-6 h-[calc(var(--ch)+140px)] w-full sm:mt-10 " +
  "[--cw:84vw] [--ch:54vw] [--gap:7vw] [--r:max(1.6vw,14px)] [--fade:30vw] " +
  "md:[--cw:46vw] md:[--ch:clamp(22vw,52svh,29.5vw)] md:[--gap:4.75vw] md:[--fade:24vw]";

/** 首页一屏里用：带子占满剩下的高度，卡片按这个高度缩小，保证整张卡都在视口里。 */
const FIT =
  "mt-0! h-full! sm:mt-0! [container-type:size] " +
  "[--ch:min(42vw,calc(100cqh-140px))] [--cw:min(52vw,calc((100cqh-140px)*1.15))] [--gap:3vw] " +
  "md:[--ch:min(34vw,calc(100cqh-140px))] md:[--cw:min(42vw,calc((100cqh-140px)*1.5))] md:[--gap:3vw]";

/** 数据还没到时占住同样的高度，页面不会跳 */
export function DeliveryBeltFallback({ fit = false }: { fit?: boolean }) {
  return <div aria-hidden className={cn(FRAME, fit && FIT)} />;
}

// 天蓝底上的字一律用深海军蓝（text-primary-foreground），不用白字，也不调淡：调淡了对比度不够
const THEMES = [
  { card: "bg-card text-foreground", cat: "text-link", sub: "text-muted-foreground", pill: "bg-primary text-primary-foreground" },
  { card: "bg-[linear-gradient(145deg,#e7f3fb,#f6e7c8)] text-foreground", cat: "text-link", sub: "text-muted-foreground", pill: "bg-primary text-primary-foreground" },
  {
    card: "bg-[linear-gradient(135deg,#d7f0fc,#b9e4f8)] text-primary-foreground",
    cat: "text-primary-foreground",
    sub: "text-primary-foreground",
    pill: "bg-white text-link",
  },
];

// 天蓝色系，深 → 浅。靠近线的 10px 只用最浅的三个
const PALETTE = ["#0369A1", "#0284C7", "#0EA5E9", "#38BDF8", "#7DD3FC", "#BAE6FD", "#F0F9FF"];
const TOP = 70; // 卡片顶边到传送带顶边的距离，和 top-[70px] 对应

const MARK: Record<Brand, string> = {
  claude: "claude.svg",
  gpt: "openai.svg",
  grok: "grok.png",
  codex: "openai.svg",
  muse: "muse.svg",
};

const PREFIX = /^\/hds-[a-z0-9]+-\d+-[a-z0-9]+(?=\/|$)/i;

function BeltLogo({ name }: { name: string }) {
  const brand = brandOf(name);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = ref.current;
    if (!img || !brand) return;
    const prefix = PREFIX.exec(window.location.pathname)?.[0] ?? "";
    img.src = `${prefix}/brands/${MARK[brand]}`;
  }, [brand]);

  if (!brand) return null;
  return (
    <span className="grid aspect-square h-[56cqh] max-w-[34%] shrink-0 place-items-center rounded-[3cqh] bg-white shadow-[0_8px_24px_rgba(3,105,161,0.12)]">
      <img
        ref={ref}
        alt=""
        src={`/brands/${MARK[brand]}`}
        className={brand === "grok" ? "size-[74%] object-contain" : "size-[58%] object-contain"}
      />
    </span>
  );
}

const mod = (a: number, b: number) => ((a % b) + b) % b;

/** 32 位整数哈希 → [0, 1)。同一格每帧结果相同，粒子才会「长」在卡片上 */
function hash(a: number, b: number, c: number) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function DeliveryBelt({ cards, fit = false }: { cards: BeltCard[]; fit?: boolean }) {
  const beltRef = useRef<HTMLDivElement>(null);
  const count = cards.length;
  // 暂停按钮：状态给按钮文字用，ref 给动画循环读（循环不跟着重渲染重建）
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  useEffect(() => {
    const belt = beltRef.current;
    const canvas = belt?.querySelector("canvas");
    const ctx = canvas?.getContext("2d");
    if (!belt || !canvas || !ctx || count === 0) return;
    const cardEls = [...belt.querySelectorAll<HTMLElement>("[data-card]")];
    const codeEls = [...belt.querySelectorAll<HTMLElement>("[data-code]")];
    const gapEl = belt.querySelector<HTMLElement>("[data-gap]")!;
    const pctEl = belt.querySelector<HTMLElement>("[data-pct]")!;
    const stateEl = belt.querySelector<HTMLElement>("[data-state]")!;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");

    // 尺寸
    let W = 0, H = 0, cw = 0, ch = 0, span = 0, Lx = 0, dpr = 1;
    let haze: CanvasGradient | null = null;
    // 传送带
    let off = 0, vel = 0, hover = 0, hoverTo = 0;
    // 拖拽
    let pid = -1, down = false, dragging = false, moved = false, startX = 0, lastX = 0, lastT = 0;
    // 计数
    let shown = 0, shownFor = -1, pctText = "", stateText = "";
    const cuts = new Array<number>(count).fill(0);
    const sparks: { x: number; y: number; vx: number; vy: number; s: number; c: string; life: number }[] = [];
    // 循环
    let raf = 0, last = 0, inView = false, ready = false;

    const measure = () => {
      const prev = span;
      W = belt.clientWidth;
      H = belt.clientHeight;
      const r = cardEls[0].getBoundingClientRect();
      cw = r.width;
      ch = r.height;
      span = cw + gapEl.getBoundingClientRect().width;
      Lx = W / 2;
      // 第一次：让第一张卡一上来就正在过线。之后改尺寸：按比例换算，保持卡片相对线的位置
      off = prev ? (off * span) / prev : W / 2 - 0.62 * cw;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      haze = ctx.createLinearGradient(Lx, 0, Lx + 150, 0);
      haze.addColorStop(0, "rgba(14,165,233,.42)");
      haze.addColorStop(1, "rgba(14,165,233,0)");
    };

    /** 正在过线的那张卡：雾气 + 钉在卡面上的抖动粒子 */
    const dissolve = (i: number, x: number, cut: number, t: number, still: boolean) => {
      ctx.fillStyle = haze!;
      ctx.fillRect(Lx, TOP, Math.min(150, x + cw - Lx), ch);

      const R = 0.3 * cw; // 粒子从线往卡片里铺多远
      const rows = Math.floor(ch / 3);
      const blink = Math.floor(t * 9) + 97;
      const g1 = Math.min(Math.floor(cw / 3), Math.floor((cut + R) / 3));
      for (let gx = Math.ceil(cut / 3); gx <= g1; gx++) {
        const sx = x + gx * 3;
        const d = sx - Lx;
        if (d < 0 || d >= R) continue;
        const p = Math.pow(1 - d / R, 1.7);
        for (let row = -5; row < rows + 5; row++) {
          // 卡片上下各溢出 5 行，越往外越稀
          const out = row < 0 ? -row : row >= rows ? row - rows + 1 : 0;
          const lit = out ? p * 0.16 * (1 - (out - 1) / 5) : p * 0.92;
          if (hash(gx, row, i) >= lit) continue;
          if (!still && hash(gx, row, blink) < 0.22) continue; // 大约五分之一在闪
          const h2 = hash(row, gx, i + 31);
          ctx.fillStyle = PALETTE[d < 10 ? 4 + Math.floor(h2 * 3) : Math.floor(h2 * h2 * 7)];
          const s = 1.1 + h2 * 1.7;
          ctx.fillRect(
            sx + (hash(gx, row, i + 53) - 0.5) * 1.6,
            TOP + row * 3 + (hash(row, gx, i + 71) - 0.5) * 1.6,
            s,
            s,
          );
        }
      }
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!cw) return;
      const still = motion.matches || pausedRef.current; // 暂停和「减少动态效果」走同一条静止分支，仍然可以拖
      const period = span * count;

      hover += (hoverTo - hover) * Math.min(1, 4 * dt);
      if (!dragging) {
        const auto = still ? 0 : -0.075 * W;
        vel += (auto * (1 - 0.65 * hover) - vel) * (1 - Math.exp(-2.2 * dt));
        off += vel * dt;
      }
      off = mod(off, period);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      let live = -1;
      for (let i = 0; i < count; i++) {
        const x = mod(off + i * span + span, period) - span;
        const cut = Math.max(0, Math.min(cw, Lx - x)); // 这张卡已经过线多少像素
        cuts[i] = cut;
        const move = `translate3d(${x}px,0,0)`;
        const card = cardEls[i].style;
        const code = codeEls[i].style;
        card.transform = move;
        card.visibility = cut >= cw ? "hidden" : "visible";
        // 过线的部分齐线切掉，切口往右 26px 淡入，和粒子接上
        const mask = cut > 0 ? `linear-gradient(90deg,transparent ${cut}px,#000 ${cut + 26}px)` : "";
        card.clipPath = cut > 0 ? `inset(0 0 0 ${cut}px round 0 var(--r) var(--r) 0)` : "";
        card.maskImage = mask;
        card.webkitMaskImage = mask;
        // 文字只在卡片被切掉的地方露出来
        code.transform = move;
        code.clipPath = `inset(0 ${cw - cut}px 0 0)`;
        code.visibility = cut > 0 ? "visible" : "hidden";
        if (cut > 0 && cut < cw) {
          live = i;
          dissolve(i, x, cut, now / 1000, still);
        }
      }

      // 火星：从线边冒出来，往文字那一侧飘
      if (live >= 0 && !still) {
        for (let k = 0; k < 3; k++) {
          if (sparks.length < 200 && Math.random() < 0.7 * Math.min(1, dt * 60))
            sparks.push({
              x: Lx + Math.random() * 30,
              y: TOP - 10 + Math.random() * (ch + 20),
              vx: -30 + Math.random() * 70 + vel * 0.6,
              vy: (Math.random() - 0.5) * 50,
              s: 0.8 + Math.random() * 1.8,
              c: PALETTE[Math.floor(Math.random() * PALETTE.length)],
              life: 0.3 + Math.random() * 0.8,
            });
        }
      }
      for (let k = sparks.length - 1; k >= 0; k--) {
        const s = sparks[k];
        s.life -= dt;
        if (s.life <= 0) {
          sparks.splice(k, 1);
          continue;
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.globalAlpha = Math.min(1, s.life * 2.2);
        ctx.fillStyle = s.c;
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
      ctx.globalAlpha = 1;

      // 计数胶囊：跟着正在过线的那张卡。换了一张就直接跳过去，否则缓动；
      // 两张卡之间的空档里继续跟上一张，让它走完到 100%（往回拖就回到 0%）
      const k = live >= 0 ? live : shownFor;
      if (k >= 0) {
        const target = (cuts[k] / cw) * 100;
        if (k !== shownFor) {
          shownFor = k;
          shown = target;
        } else shown += (target - shown) * Math.min(1, dt * 14);
        const pct = Math.round(shown);
        const a = `${pct}%`;
        const b = pct >= 99 ? "已发货" : "发货中";
        if (a !== pctText) pctEl.textContent = pctText = a;
        if (b !== stateText) stateEl.textContent = stateText = b;
      }

      if (!ready) {
        ready = true;
        belt.dataset.ready = "";
      }
    };

    // 只在看得见的时候跑
    const sync = () => {
      const want = inView && !document.hidden;
      if (want && !raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!want && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const onEnter = () => (hoverTo = 1);
    const onLeave = () => (hoverTo = 0);
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pid = e.pointerId;
      down = true;
      moved = false;
      startX = lastX = e.clientX;
      lastT = e.timeStamp;
    };
    const onMove = (e: PointerEvent) => {
      if (!down || e.pointerId !== pid) return;
      if (!dragging) {
        // 在传送带外面松的手：这里收不到 pointerup，靠没有按键的移动来收尾
        if (!e.buttons) {
          down = false;
          return;
        }
        // 移动超过 6px 才算拖拽；没超过就还是一次普通的点击，照常进商品页
        if (Math.abs(e.clientX - startX) <= 6) return;
        dragging = moved = true;
        belt.setPointerCapture(pid);
        belt.dataset.dragging = "";
      }
      const dx = e.clientX - lastX;
      off += dx;
      vel = (dx / Math.max(8, e.timeStamp - lastT)) * 1000 * 0.8 + vel * 0.2;
      lastX = e.clientX;
      lastT = e.timeStamp;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      down = false;
      if (!dragging) return;
      dragging = false;
      if (e.timeStamp - lastT > 120) vel = 0; // 停住再松手，不带惯性
      if (belt.hasPointerCapture(pid)) belt.releasePointerCapture(pid);
      delete belt.dataset.dragging;
    };
    // 拖完松手时浏览器还会补一个 click：拦在捕获阶段，卡片链接就不会跳转
    const onClick = (e: MouseEvent) => {
      if (!moved) return;
      moved = false;
      e.preventDefault();
      e.stopPropagation();
    };
    // 横向滚轮（触控板左右滑）推一把传送带；竖向滚动不管，页面照常滚
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      vel = Math.max(-6 * W, Math.min(6 * W, vel - e.deltaX * 6));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(belt);
    const io = new IntersectionObserver((entries) => {
      inView = entries[entries.length - 1].isIntersecting; // 积压多条时最后一条才是现在的状态
      sync();
    });
    io.observe(belt);
    document.addEventListener("visibilitychange", sync);
    belt.addEventListener("pointerenter", onEnter);
    belt.addEventListener("pointerleave", onLeave);
    belt.addEventListener("pointerdown", onDown);
    belt.addEventListener("pointermove", onMove);
    belt.addEventListener("pointerup", onUp);
    belt.addEventListener("pointercancel", onUp);
    belt.addEventListener("click", onClick, true);
    belt.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      belt.removeEventListener("pointerenter", onEnter);
      belt.removeEventListener("pointerleave", onLeave);
      belt.removeEventListener("pointerdown", onDown);
      belt.removeEventListener("pointermove", onMove);
      belt.removeEventListener("pointerup", onUp);
      belt.removeEventListener("pointercancel", onUp);
      belt.removeEventListener("click", onClick, true);
      belt.removeEventListener("wheel", onWheel);
      delete belt.dataset.ready;
      delete belt.dataset.dragging;
    };
  }, [count]);

  if (count === 0) return null;

  return (
    <div
      ref={beltRef}
      role="group"
      aria-label="商品到发货的演示"
      className={cn(
        FRAME,
        fit && FIT,
        // clip 而不是 hidden：hidden 的容器会被键盘焦点带着横向滚动
        "group cursor-grab touch-pan-y overflow-clip select-none data-[dragging]:cursor-grabbing",
      )}
    >
      {/* 第一帧摆好位置之前先不显示，免得六张卡叠在左上角闪一下 */}
      <div className="absolute inset-0 opacity-0 transition-opacity duration-500 group-data-[ready]:opacity-100 motion-reduce:transition-none">
        <i data-gap className="absolute w-[var(--gap)]" />

        {/* 线左边：发货后买家拿到的东西（示意）。越往左越淡 */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            maskImage: "linear-gradient(90deg, transparent 0, #000 var(--fade))",
            WebkitMaskImage: "linear-gradient(90deg, transparent 0, #000 var(--fade))",
          }}
        >
          {cards.map((c, i) => (
            <div
              key={i}
              data-code
              className="@container invisible absolute top-[70px] left-0 h-[var(--ch)] w-[var(--cw)] overflow-hidden font-mono whitespace-pre will-change-[transform,clip-path]"
            >
              {/* 字号写在子元素上：cqw 要以这一块为容器，写在它自己身上会按外层算。
                  窄一点的桌面窗口里卡片只有三四百像素宽，所以各给一个最小字号 */}
              <div className="absolute top-0 left-0 w-full overflow-hidden text-[max(3cqw,10px)] leading-[1.5] text-muted-foreground md:w-[49%] md:text-[max(1.9cqw,10px)]">
                {`${c.external ? "" : "订单号 K••••••••••••••••\n"}${c.name} × 1\n已付款 · 已发货\n────────────────\n卡密 01（示意）\n账号 user••••@example.com\n密码 ••••••••`}
              </div>
              <div className="absolute bottom-0 left-0 text-[max(3cqw,10px)] leading-[1.5] text-muted-foreground/55 md:top-0 md:bottom-auto md:left-[51%] md:text-[max(1.9cqw,10px)]">
                {`# 示意内容，不是真实卡密\n# 付款成功后自动发货\n# keyly /p/${c.id}`}
              </div>
            </div>
          ))}
        </div>

        {/* 线右边：能买的商品。货架上有同样的链接，这里不进键盘的 Tab 顺序（会动、会被切掉，停不住焦点） */}
        {cards.map((c, i) => {
          const t = THEMES[c.theme % THEMES.length];
          return (
            <Link
              key={i}
              href={`/p/${c.id}`}
              prefetch={false}
              tabIndex={-1}
              draggable={false}
              data-card
              className={cn(
                "@container absolute top-[70px] left-0 block h-[var(--ch)] w-[var(--cw)] overflow-hidden rounded-[var(--r)] will-change-[transform,clip-path] group-data-[dragging]:cursor-grabbing",
                t.card,
              )}
            >
              <div aria-hidden className={cn("belt-wash", `belt-wash-${c.theme % 3}`)} />
              <div className="relative z-[1] flex h-full items-center gap-[4.5cqw] p-[5cqw] md:p-[4.5cqw]">
                <BeltLogo name={`${c.category} ${c.name}`} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className={cn("font-mono text-[max(3.2cqw,10px)] leading-[1.3] font-medium md:text-[max(1.8cqw,11px)]", t.cat)}>
                    {c.category || "数字商品"}
                  </p>
                  <p className="mt-[1.4cqw] line-clamp-2 font-serif text-[5.2cqw] leading-[1.2] font-medium md:text-[3.4cqw]">
                    {c.name}
                  </p>
                  <div className="mt-[3cqw] flex items-center justify-between gap-[3cqw]">
                    <p className="text-[6cqw] leading-none font-semibold tabular-nums md:text-[3.8cqw]">{c.price}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-[4cqw] py-[1.6cqw] text-[3.6cqw] leading-none md:px-[2.6cqw] md:py-[1.1cqw] md:text-[max(2cqw,12px)]",
                        t.pill,
                      )}
                    >
                      购买
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}

        <canvas aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      </div>

      {/* 付款这条线：上面比卡片多出 14px，下面多出 26px；光晕只往卡片那一侧漫 */}
      <div aria-hidden className="pointer-events-none absolute top-[56px] left-1/2 h-[calc(var(--ch)+40px)] w-0">
        <b className="absolute top-[4%] bottom-[4%] left-0 w-[42px] bg-[linear-gradient(90deg,rgba(14,165,233,.55),transparent)] blur-[6px]" />
        <i className="absolute inset-y-0 -left-0.5 w-1 rounded-[4px] bg-[linear-gradient(#38BDF8,#0EA5E9_12%,#0EA5E9_88%,#38BDF8)] shadow-[0_0_10px_2px_rgba(14,165,233,.85),0_0_34px_10px_rgba(14,165,233,.38)]" />
      </div>

      {/* 计数胶囊：数字每帧都在变，不念给读屏 */}
      <div className="pointer-events-none absolute top-[5px] left-1/2 flex -translate-x-1/2 flex-col items-center gap-[9px]">
        <span className="font-mono type-caption text-muted-foreground">付款即发货</span>
        <span
          aria-hidden
          className="flex h-[26px] items-stretch overflow-hidden rounded-full font-mono type-caption font-medium whitespace-nowrap shadow-[0_0_18px_rgba(14,165,233,.35)]"
        >
          <span
            data-pct
            className="flex min-w-[6.5ch] items-center justify-end bg-primary pr-[11px] pl-[13px] text-primary-foreground tabular-nums"
          >
            0%
          </span>
          <span data-state className="flex items-center bg-[#F0F9FF] pr-3 pl-2.5 text-link">
            发货中
          </span>
        </span>
      </div>

      {/* 自己会动的内容要能停下来。已经开了「减少动态效果」的本来就不动，不用显示 */}
      <button
        type="button"
        onClick={() => {
          pausedRef.current = !pausedRef.current;
          setPaused(pausedRef.current);
        }}
        className="absolute bottom-2 left-1/2 h-7 -translate-x-1/2 cursor-pointer rounded-full bg-foreground/[0.06] px-3 type-caption text-muted-foreground outline-offset-2 outline-ring transition-colors duration-[400ms] ease-soft hover:text-foreground focus-visible:outline-2 motion-reduce:hidden"
      >
        {paused ? "继续" : "暂停"}
      </button>
    </div>
  );
}
