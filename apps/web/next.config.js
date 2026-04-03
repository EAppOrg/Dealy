/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dealy/db", "@dealy/domain"],
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
