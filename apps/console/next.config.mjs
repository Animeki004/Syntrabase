/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@syntrabase/shared-types', '@syntrabase/client-sdk', '@platform/shared-types', '@platform/client-sdk'],
};

export default nextConfig;
