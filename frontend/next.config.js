/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the browser origin: Next otherwise normalizes loopback IPs to
  // localhost again after middleware and breaks authenticated RSC prefetches.
  skipMiddlewareUrlNormalize: true,
  reactStrictMode: true,
  // 验收服务与日常开发隔离构建产物，防止 dev/build 互相覆盖。
  distDir: process.env.ARK_VERIFY === "1" ? ".next-verify" : ".next",
  typescript: { tsconfigPath: process.env.ARK_VERIFY === "1" ? "tsconfig.verify.json" : "tsconfig.json" },
  // 隐藏仅供开发者使用的左下角 “N” 标识，产品界面使用自己的用户设置入口。
  devIndicators: false,
  async rewrites() {
    const upstream = process.env.API_UPSTREAM || "http://127.0.0.1:8001";
    return [{ source: "/api/:path*", destination: `${upstream}/api/:path*` }];
  },
}

module.exports = nextConfig
