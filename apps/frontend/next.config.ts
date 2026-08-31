import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모노레포 공유 패키지를 Next 빌드 파이프라인이 함께 처리하도록.
  transpilePackages: ["@incident-radar/shared"],
};

export default nextConfig;
