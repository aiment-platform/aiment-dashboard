import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module: keep it server-only, never bundled.
  serverExternalPackages: ["better-sqlite3"],
  // 開発用バッジの既定位置(左下)は、盤の知らせ(トースト)とぶつかるので右上へ逃がす。
  devIndicators: { position: "top-right" },
};

export default nextConfig;
