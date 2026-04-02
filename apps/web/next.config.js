/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dealy/db", "@dealy/domain"],
};

module.exports = nextConfig;
