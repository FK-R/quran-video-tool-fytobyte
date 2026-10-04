/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Native / CLI-wrapping packages must not be bundled by webpack
    serverComponentsExternalPackages: ["sharp", "fluent-ffmpeg", "@prisma/client"],
  },
};
export default nextConfig;
