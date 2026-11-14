export type Brand = "claude" | "gpt" | "grok" | "codex" | "muse";

export function brandOf(name: string): Brand | null {
  if (/claude/i.test(name)) return "claude";
  if (/grok/i.test(name)) return "grok";
  if (/codex/i.test(name)) return "codex";
  if (/muse/i.test(name)) return "muse";
  if (/chatgpt|gpt|卡充|ios|邮箱|越南/i.test(name)) return "gpt";
  return null;
}

export const BRAND_LINE: Record<Brand, string> = {
  claude: "For essays and class",
  gpt: "The everyday one",
  grok: "Ask it straight",
  codex: "For the code",
  muse: "A finished account",
};
