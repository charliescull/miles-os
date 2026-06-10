/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow remote listing thumbnails (GovDeals, eBay, etc.) without per-host config.
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
};

export default nextConfig;
