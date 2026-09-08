import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 開発用バッジの既定位置(左下)は、盤の知らせ(トースト)とぶつかるので右上へ逃がす。
  devIndicators: { position: "top-right" },
};

export default nextConfig;
