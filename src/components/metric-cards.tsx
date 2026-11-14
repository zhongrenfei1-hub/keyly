"use client";

import { useEffect, useRef } from "react";
import { Container } from "@/components/brand";
import "./metric-cards.css";

/**
 * 首页「为什么在这里买」：三张指标卡，每张中间一个点阵拼的大数字。
 * 结构、版式、动效照 docs/参考-Performance-三卡片设计稿.md；稿子里的视频不用，图形都是下面的 SVG。
 * 三个数字只写站里真实成立的（见 docs/改版-定法.md），不要往里加销量、用时这一类。
 */

// 点阵字形：每个字 7 行，1 是亮的点。数字照稿子抄全了，换数字不用再补
const GLYPHS: Record<string, string> = {
  "0": "01110 10001 10011 10101 11001 10001 01110",
  "1": "010 110 010 010 010 010 111",
  "2": "01110 10001 00001 00010 00100 01000 11111",
  "3": "11110 00001 00001 01110 00001 00001 11110",
  "4": "00010 00110 01010 10010 11111 00010 00010",
  "5": "11111 10000 10000 11110 00001 00001 11110",
  "6": "01110 10000 10000 11110 10001 10001 01110",
  "7": "11111 00001 00010 00100 01000 01000 01000",
  "8": "01110 10001 10001 01110 10001 10001 01110",
  "9": "01110 10001 10001 01111 00001 00001 01110",
};

/** 把一串数字画成圆点。纵向点距 4，横向点距 pitchX，字和字之间空一列 */
function Dots({ text, pitchX = 5, className }: { text: string; pitchX?: number; className?: string }) {
  const dots: React.ReactNode[] = [];
  let x = 0;
  for (const ch of text) {
    const rows = GLYPHS[ch].split(" ");
    rows.forEach((row, y) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] === "1") {
          dots.push(<circle key={`${x}-${y}-${c}`} cx={x + c * pitchX + 1.55} cy={y * 4 + 1.55} r={1.8} />);
        }
      }
    });
    x += (rows[0].length + 1) * pitchX;
  }
  // 宽度收到最后一列点的右边，数字才居得了中
  return (
    <svg viewBox={`0 0 ${x - 2 * pitchX + 3.1} 28`} fill="currentColor" aria-hidden className={className}>
      {dots}
    </svg>
  );
}

// 第一张卡的弧：圆心 (163,163)，角度从正右方顺时针算。取两位小数，服务器和浏览器算出来的字符串才一样
const at = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [+(163 + r * Math.cos(a)).toFixed(2), +(163 + r * Math.sin(a)).toFixed(2)];
};
const TICKS = Array.from({ length: 23 }, (_, i) => {
  const major = i % 5 === 0;
  const [x1, y1] = at(190 + i * 5, major ? 129 : 133);
  const [x2, y2] = at(190 + i * 5, 142);
  return { x1, y1, x2, y2, major };
});
// 弧上的三个点，对应三步；第三个点落在扫过来的那束光的边上
const STEP_DOTS = [205, 252, 300].map((deg) => at(deg, 158.5));

function Grain() {
  return (
    <svg className="mc-grain" viewBox="0 0 429 554" preserveAspectRatio="none" aria-hidden>
      <rect width="429" height="554" filter="url(#mc-noise)" />
    </svg>
  );
}

export function MetricCards() {
  const rootRef = useRef<HTMLElement>(null);

  // 滚到这一节才播入场动画，只播一次。打开页面时它已经在屏幕里（或在上方）就不藏也不播
  useEffect(() => {
    const el = rootRef.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.anim = "armed";
    let done: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        el.dataset.anim = "play";
        // 整套动画最长约 2 秒；播完摘掉属性，和稿子一样留 3.2 秒
        done = setTimeout(() => delete el.dataset.anim, 3200);
      },
      { rootMargin: "0px 0px -15% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(done);
      delete el.dataset.anim;
    };
  }, []);

  return (
    <section ref={rootRef} aria-labelledby="why-heading" className="mc-root">
      {/* 三张卡共用的颗粒滤镜 */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <filter id="mc-noise">
          <feTurbulence type="fractalNoise" baseFrequency=".54" numOctaves="3" seed="27" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.8" intercept="-.25" />
            <feFuncG type="linear" slope="1.8" intercept="-.25" />
            <feFuncB type="linear" slope="1.8" intercept="-.25" />
            <feFuncA type="table" tableValues="0 .52" />
          </feComponentTransfer>
        </filter>
      </svg>

      <Container className="py-10 sm:py-14">
        <p className="font-hand text-[32px] leading-none text-link">Why here</p>
        {/* 两栏从 lg 起：再窄的话左栏放不下八个字的标题 */}
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,25rem)] lg:items-end lg:gap-12">
          <h2 id="why-heading" className="type-serif type-title sm:type-headline">
            <span className="mc-line">为什么在这里买。</span>
            <span className="mc-line text-muted-foreground">
              看这
              <Dots text="3" pitchX={4} className="mc-dot-word" />
              <span className="sr-only">3</span>
              个数字。
            </span>
          </h2>
          <p className="mc-intro type-body text-pretty text-muted-foreground">
            流程短，不用建账号，什么时候来都能买。卡片上写的，都是这家店现在就成立的事。
          </p>
        </div>

        <ul className="mc-cards">
          {/* 3 步 */}
          <li className="mc-card mc-deep">
            <Grain />
            <h3 className="mc-title">
              下单流程
              <br />
              从选到拿
            </h3>
            <svg className="mc-gauge" viewBox="0 0 326 326" aria-hidden>
              <defs>
                <linearGradient id="mc-arc" gradientUnits="userSpaceOnUse" x1="7" y1="136" x2="312" y2="109">
                  <stop offset="0" stopColor="#7dd3fc" stopOpacity=".06" />
                  <stop offset=".08" stopColor="#7dd3fc" stopOpacity=".44" />
                  <stop offset=".34" stopColor="#38bdf8" stopOpacity=".94" />
                  <stop offset=".58" stopColor="#38bdf8" />
                  <stop offset=".82" stopColor="#f0f9ff" stopOpacity=".74" />
                  <stop offset=".94" stopColor="#fff" stopOpacity=".28" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="mc-arc-shadow" gradientUnits="userSpaceOnUse" x1="11" y1="136" x2="308" y2="110">
                  <stop offset="0" stopColor="#082f49" stopOpacity=".04" />
                  <stop offset=".09" stopColor="#082f49" stopOpacity=".17" />
                  <stop offset=".52" stopColor="#082f49" stopOpacity=".18" />
                  <stop offset=".78" stopColor="#082f49" stopOpacity=".1" />
                  <stop offset="1" stopColor="#082f49" stopOpacity="0" />
                </linearGradient>
                <radialGradient id="mc-beam" gradientUnits="userSpaceOnUse" cx="163" cy="163" r="145">
                  <stop offset=".3" stopColor="#bae6fd" stopOpacity="0" />
                  <stop offset=".45" stopColor="#bae6fd" stopOpacity=".05" />
                  <stop offset=".7" stopColor="#bae6fd" stopOpacity=".13" />
                  <stop offset=".9" stopColor="#bae6fd" stopOpacity=".18" />
                  <stop offset="1" stopColor="#bae6fd" stopOpacity=".1" />
                </radialGradient>
                <linearGradient id="mc-beam-edge" gradientUnits="userSpaceOnUse" x1="238" y1="33" x2="190.5" y2="115.4">
                  <stop offset="0" stopColor="#f0f9ff" stopOpacity=".5" />
                  <stop offset=".48" stopColor="#bae6fd" stopOpacity=".3" />
                  <stop offset=".82" stopColor="#bae6fd" stopOpacity=".12" />
                  <stop offset="1" stopColor="#bae6fd" stopOpacity="0" />
                </linearGradient>
                <filter id="mc-soft">
                  <feGaussianBlur stdDeviation="1.35" />
                </filter>
                <filter id="mc-halo" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="5.2" />
                </filter>
                <filter id="mc-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="11" />
                </filter>
              </defs>
              <g fill="none" strokeLinecap="round">
                <path d="M11.34 136.26A154 154 0 0 1 307.71 110.33" strokeWidth="3.2" stroke="url(#mc-arc-shadow)" />
                <path d="M6.91 135.48A158.5 158.5 0 0 1 311.94 108.79" strokeWidth="2.2" stroke="url(#mc-arc)" />
                <path d="M19.22 137.65A146 146 0 0 1 236 36.56" strokeWidth="1.15" stroke="rgb(186 230 253 / .4)" strokeLinecap="butt" />
              </g>
              <path
                d="M238 33.1A150 150 0 0 1 277.9 66.6L199.8 119.5A55 55 0 0 0 190.5 115.4Z"
                fill="#f0f9ff"
                opacity=".06"
                filter="url(#mc-halo)"
              />
              <path
                d="M238 33.1A150 150 0 0 1 277.9 66.6L199.8 119.5A55 55 0 0 0 190.5 115.4Z"
                fill="url(#mc-beam)"
                filter="url(#mc-soft)"
              />
              <path d="M238 33.1L190.5 115.4" stroke="url(#mc-beam-edge)" strokeWidth="1.25" strokeLinecap="round" filter="url(#mc-soft)" />
              <g stroke="rgb(186 230 253 / .5)">
                {TICKS.map((t, i) => (
                  <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.major ? 1.5 : 1} />
                ))}
              </g>
              <ellipse cx="225" cy="166" rx="92" ry="76" fill="#fff" opacity=".055" filter="url(#mc-glow)" />
              {STEP_DOTS.map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="5.5" fill={i === 2 ? "#fff" : "#bae6fd"} stroke="#0369a1" strokeWidth="2" />
              ))}
            </svg>
            <p className="mc-metric">
              <Dots text="3" className="mc-dots" />
              <span className="sr-only">3</span>
              <span className="mc-unit">步</span>
            </p>
            <p className="mc-caption">
              选商品、付款、
              <br />
              拿卡密
            </p>
            <a href="#store" className="mc-more">
              去货架
            </a>
          </li>

          {/* 0 次注册 */}
          <li className="mc-card mc-mid">
            <svg className="mc-wall" viewBox="0 0 429 554" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="mc-tile-a" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity=".5" />
                  <stop offset="1" stopColor="#fff" stopOpacity=".14" />
                </linearGradient>
                <linearGradient id="mc-tile-b" x1="1" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#f0f9ff" stopOpacity=".44" />
                  <stop offset="1" stopColor="#7dd3fc" stopOpacity=".1" />
                </linearGradient>
                <linearGradient id="mc-tile-c" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#0284c7" stopOpacity=".24" />
                  <stop offset="1" stopColor="#0284c7" stopOpacity=".06" />
                </linearGradient>
                <filter id="mc-tile-soft">
                  <feGaussianBlur stdDeviation="3.4" />
                </filter>
              </defs>
              {/* 上排三块、中排三块；中排中间那块上面盖着玻璃 */}
              <g filter="url(#mc-tile-soft)">
                <rect x="-24" y="22" width="106" height="149" rx="15" fill="url(#mc-tile-b)" />
                <rect x="88" y="22" width="247" height="150" rx="15" fill="url(#mc-tile-a)" />
                <rect x="346" y="22" width="111" height="147" rx="15" fill="url(#mc-tile-b)" />
                <rect x="-24" y="177" width="108" height="174" rx="15" fill="url(#mc-tile-a)" />
                <rect x="88" y="177" width="247" height="174" rx="15" fill="url(#mc-tile-c)" />
                <rect x="344" y="175" width="113" height="176" rx="15" fill="url(#mc-tile-c)" />
              </g>
            </svg>
            <Grain />
            <h3 className="mc-title">
              买家账号
              <br />
              不用注册
            </h3>
            <div className="mc-window" aria-hidden>
              <div className="mc-window-lines">
                <span />
                <span />
                <span />
              </div>
            </div>
            <p className="mc-metric">
              <Dots text="0" className="mc-dots" />
              <span className="sr-only">0</span>
              <span className="mc-unit">次注册</span>
            </p>
            <p className="mc-caption">
              不用建账号，
              <br />
              留个联系方式就行
            </p>
          </li>

          {/* 24 小时 */}
          <li className="mc-card mc-light">
            <Grain />
            <h3 className="mc-title">
              营业时间
              <br />
              全天不打烊
            </h3>
            <svg className="mc-map" viewBox="0 0 429 238" preserveAspectRatio="none" aria-hidden>
              <g fill="none" stroke="#0284c7" strokeWidth="1">
                <path opacity=".3" d="M0 5H128c27 0 36 7 39 26 2 16 9 22 24 22h106c16 0 23-8 25-25 2-16 10-23 31-23h76" />
                <path opacity=".4" d="M0 117h46c15 0 22 8 26 25 5 23 12 31 31 31h174c18 0 25-8 30-31 4-17 11-25 26-25h96" />
                <path opacity=".44" d="M0 173h87c15 0 22 7 27 25 4 15 11 22 28 22h140c17 0 25-7 29-22 5-18 12-25 28-25h90" />
                <path opacity=".26" d="M0 228h120c17 0 25-5 28-18 4-15 10-20 28-20h81c18 0 25 6 28 20 4 13 11 18 28 18h116" />
                <path opacity=".36" d="M0 5H429M0 61H429M0 117H429" />
                <path opacity=".16" d="M0 173H429" />
              </g>
              <g fill="none" stroke="#0369a1" strokeWidth="1.4">
                <path opacity=".52" d="M0 61h95c14 0 22-6 27-20 4-13 12-20 27-20h115c15 0 23 6 27 20 5 14 13 20 28 20h110" />
                <path opacity=".94" d="M0 117h88c15 0 22-8 25-25 4-24 12-31 31-31h129c20 0 27 7 31 31 3 17 10 25 26 25h99" />
              </g>
              <circle cx="45" cy="117" r="5.5" fill="#fff" stroke="#0369a1" strokeWidth="2" />
              <g fill="#0284c7">
                <circle cx="133" cy="61" r="6.5" />
                <circle cx="189" cy="61" r="6.5" />
                <circle cx="319" cy="61" r="6.5" />
                <circle cx="319" cy="117" r="6.5" />
              </g>
            </svg>
            <p className="mc-metric">
              <Dots text="24" className="mc-dots" />
              <span className="sr-only">24</span>
              <span className="mc-unit">小时</span>
            </p>
            <p className="mc-caption">
              全天自助下单，
              <br />
              付款后自动发货
            </p>
          </li>
        </ul>
      </Container>
    </section>
  );
}
