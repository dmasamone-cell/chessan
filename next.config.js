/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Abaikan error TypeScript saat build Vercel
    ignoreBuildErrors: true,
  },
  eslint: {
    // Abaikan warning ESLint saat build Vercel
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
