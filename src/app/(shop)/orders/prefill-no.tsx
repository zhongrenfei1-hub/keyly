"use client";

import { useEffect } from "react";

/**
 * 从页脚的「查订单」过来时网址里带着 ?no=…：把订单号填进表单，光标放到还没填的邮箱上。
 * 在浏览器里做，/orders 就还是整页静态的；订单号那一格里已经有字就不动。
 */
export function PrefillOrderNo() {
  useEffect(() => {
    const no = new URLSearchParams(location.search).get("no")?.trim().slice(0, 40);
    const input = document.getElementById("no") as HTMLInputElement | null;
    if (!no || !input || input.value) return;
    input.value = no;
    document.getElementById("email")?.focus();
  }, []);
  return null;
}
