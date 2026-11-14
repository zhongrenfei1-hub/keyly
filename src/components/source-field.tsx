"use client";

import { useEffect } from "react";

// 订单来源：记下买家第一次进站是从哪里来的，下单时随表单一起交上去，只给站长做统计用。
// 只存在买家自己浏览器的 localStorage 里，不设置 cookie，也不发给任何第三方。

const KEY = "keyly_src";
const KEEP_MS = 30 * 24 * 60 * 60 * 1000; // 记 30 天，过期后重新取

/** 只保留字母、数字、中文、点、横线、下划线，最多 40 个字符（服务端 placeOrder 里还会再洗一次） */
const clean = (s: string) => s.replace(/[^a-zA-Z0-9一-鿿._-]/g, "").slice(0, 40);

/** 取来源：存过且没过期就用存下来的；否则看网址参数，再看是从哪个站点过来的 */
function readSource(): string {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (typeof saved?.v === "string" && saved.v && Date.now() - saved.t < KEEP_MS)
      return clean(saved.v);
  } catch {
    // 读不了（比如无痕模式禁用了存储）就当没存过
  }

  const query = new URLSearchParams(window.location.search);
  let value = clean(query.get("from") ?? "") || clean(query.get("utm_source") ?? "");
  if (!value && document.referrer) {
    try {
      const host = new URL(document.referrer).hostname;
      if (host !== window.location.hostname) value = clean(host);
    } catch {
      // 来路网址解析不了就当没有
    }
  }

  if (value) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: value, t: Date.now() }));
    } catch {
      // 存不了也没关系，这一页的表单里还是带得上
    }
  }
  return value;
}

/** 放在前台布局里，不渲染任何东西：买家不管先进哪个页面，都把来源记下来 */
export function SourceTracker() {
  useEffect(() => {
    readSource();
  }, []);
  return null;
}

/** 下单表单里的隐藏输入框。值在浏览器里填，服务端渲染出来的是空的。 */
export function SourceField() {
  return (
    <input
      type="hidden"
      name="source"
      ref={(el) => {
        if (el) el.value = readSource();
      }}
    />
  );
}
