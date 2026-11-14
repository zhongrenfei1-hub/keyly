// 站点配置和格式化。纯函数，不依赖 Next，前后台和测试都能用。

export const SITE = {
  name: "Keyly",
  tagline: "AI 账号与数字商品，付款即发货",
  /** 客服联系方式，留空则售后页只显示工单表单 */
  support: process.env.SUPPORT_CONTACT ?? "",
  /** 买家群。留学生多，用 Telegram */
  telegram: "https://t.me/+PjJLE2PNII5iOTE1",
  discord: "https://discord.gg/G6gWtSfT6",
  /** 下单后锁定库存多少分钟，超时未付自动关闭 */
  orderTtlMinutes: 15,
  /** 单笔订单最多买几件 */
  maxQuantity: 10,
};

/** 认识的寄售平台：域名 → 名字。写给买家看，方便他们搜一下、核对一下。不认识的返回空串，页面上只显示域名。 */
const PLATFORMS: [domain: string, name: string][] = [
  ["wzyp.cn", "链动小铺"],
  ["ldxp.cn", "链动小铺"],
];

export const platformName = (host: string) =>
  PLATFORMS.find(([d]) => host === d || host.endsWith(`.${d}`))?.[1] ?? "";

export const yuan = (cents: number) => `¥${(cents / 100).toFixed(2)}`;

const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 毫秒时间戳 → 北京时间「11/13 21:05」 */
export const fmtTime = (ms: number) => timeFmt.format(ms);

export const STATUS_LABEL: Record<string, string> = {
  pending: "待付款",
  paid: "已付款，待发货",
  delivered: "已发货",
  expired: "已关闭",
  refunded: "已退款",
};
