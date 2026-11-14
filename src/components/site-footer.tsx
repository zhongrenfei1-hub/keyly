import Link from "next/link";
import { LogoMark } from "@/components/brand";
import { FooterFlow } from "@/components/footer-flow";
import { SITE } from "@/lib/site";
import "./site-footer.css";

// 列标题是手写的英文点缀（Caveat 没有中文字形），屏幕阅读器读的是 name
const COLUMNS = [
  {
    hand: "Shop",
    name: "选购",
    links: [
      { label: "全部商品", href: "/#store" },
      { label: "兑换码取货", href: "/redeem" },
      { label: "常见问题", href: "/#faq" },
    ],
  },
  {
    hand: "Orders",
    name: "订单",
    links: [
      { label: "查订单", href: "/orders" },
      { label: "售后工单", href: "/support" },
    ],
  },
];

/**
 * 页脚：左边一张动态卡（标志、短介绍、进群），右边一张白卡（链接、购买须知、查订单）。
 */
export function SiteFooter() {
  return (
    <footer className="ft px-3 pb-4 sm:px-6 sm:pb-6">
      <div className="ft-grid">
        <div className="ft-left">
          <FooterFlow />
          <p className="ft-logo">
            <LogoMark mono className="ft-mark" />
            {SITE.name}
          </p>
          <div className="ft-community">
            <p className="font-hand">Ask us here.</p>
            <p>买完了，来群里说。</p>
          </div>
          <div className="ft-help">
            <span className="font-hand" aria-hidden>
              Join us
            </span>
            <ul aria-label="进群">
              <li>
                <a href={SITE.telegram} target="_blank" rel="noopener noreferrer" aria-label="Telegram" title="Telegram" className="ft-icon">
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M21.2 4.3 2.9 11.2c-.9.4-.9 1.1-.2 1.3l4.7 1.5 1.8 5.5c.2.6.1.9.7.9.4 0 .6-.2.9-.4l2.3-2.2 4.8 3.5c.8.5 1.4.2 1.6-.7l3-14.2c.3-1.3-.5-1.9-1.3-1.5z"
                    />
                  </svg>
                </a>
              </li>
              <li>
                <a href={SITE.discord} target="_blank" rel="noopener noreferrer" aria-label="Discord" title="Discord" className="ft-icon">
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M18.6 5.4A16 16 0 0 0 14.8 4l-.4.7a15 15 0 0 1 3.6 1.5 15 15 0 0 0-12 0A13 13 0 0 1 9.6 4.7L9.2 4a16 16 0 0 0-3.8 1.4C2.4 8.4 1.8 12.1 2.1 15.7A16 16 0 0 0 7 18.2l.7-1a10 10 0 0 1-1.6-.7l.4-.3c3 1.4 6.3 1.4 9.3 0l.4.3c-.5.3-1 .5-1.6.7l.7 1a16 16 0 0 0 4.9-2.5c.4-4.2-.6-7.9-1.6-10.3zM9.2 13.8c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.7.8 1.6 1.8-.7 1.8-1.6 1.8zm5.6 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.7.8 1.6 1.8-.7 1.8-1.6 1.8z"
                    />
                  </svg>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="ft-right card-solid">
          <Link href="/#store" aria-label="看全部商品" title="看全部商品" className="ft-lucky">
            <LogoMark mono className="ft-cube" />
            <span className="ft-lucky-text font-hand" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M3 20 C 6 14, 10 9, 18 5" />
                <path d="M18 5 L 12 5" />
                <path d="M18 5 L 18 11" />
              </svg>
              Take a look?
            </span>
          </Link>

          <div className="ft-cols">
            {COLUMNS.map((col) => (
              <nav key={col.name} aria-label={col.name}>
                <p className="font-hand" aria-hidden>
                  {col.hand}
                </p>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>

          <div className="ft-bottom">
            <div className="ft-notes">
              {/* 只说在本站付款的订单：有的商品是跳到合作平台付款的，那边的流程由商品页自己讲 */}
              <p>
                在本站付款的订单，付款成功后卡密直接显示在订单页；下单后库存为你保留{" "}
                {SITE.orderTtlMinutes} 分钟，超时订单自动关闭。
              </p>
              <p>质保期限和退换条件以各商品页的说明为准。卡密有问题，请带订单号到售后页提交工单。</p>
              <p>© {SITE.name}</p>
            </div>
            <div className="ft-cta">
              <p>
                买过了？
                <strong>输订单号，找回卡密。</strong>
              </p>
              {/* 普通的 GET 表单，不开脚本也能用：跳到 /orders?no=…，查订单页把订单号预先填好 */}
              <form action="/orders" className="ft-lookup">
                <label htmlFor="ft-no" className="sr-only">
                  订单号
                </label>
                <input
                  id="ft-no"
                  name="no"
                  required
                  maxLength={40}
                  autoComplete="off"
                  placeholder="K 开头，共 17 位"
                />
                <button type="submit">查订单</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* viewBox 是按 Inter 粗体量好的「Keyly」五个字母的墨迹范围，字的两端正好顶到两边。站名改了要重量 */}
      <div className="ft-wm" aria-hidden>
        <svg viewBox="21.04 -232.81 813.9 299.38">
          <text x="0" y="0" fontSize="320">
            {SITE.name}
          </text>
        </svg>
      </div>
    </footer>
  );
}
