/** @type {import('next').NextConfig} */
const nextConfig = {
  // The studio engine boots once and owns its DOM; skip the dev-only double mount.
  reactStrictMode: false,
};
export default nextConfig;
