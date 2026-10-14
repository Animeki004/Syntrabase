/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@syntrabase/admin-sdk', '@syntrabase/shared-types', '@platform/admin-sdk', '@platform/shared-types'],
};

export default nextConfig;
