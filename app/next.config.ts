import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // better-sqlite3 是原生模块，必须留在服务端，不能被 bundle
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
