import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // 开发时也允许用 127.0.0.1 打开（默认只认 localhost）
  allowedDevOrigins: ["127.0.0.1", "localhost", "0.0.0.0"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // 预览工作区根目录另有一份 lockfile，不锁住的话会编错项目
    root: path.dirname(fileURLToPath(import.meta.url)),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
