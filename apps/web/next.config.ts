import type { NextConfig } from "next";

// Allow `next/image` to optimize remote previews coming from Backblaze B2.
// Presigned download URLs use the bucket-specific S3 hostname pattern:
//   <bucket>.s3.<region>.backblazeb2.com    (path-style and virtual-host)
//   s3.<region>.backblazeb2.com             (path-style)
// One wildcard covers every region + bucket, so this config drops in
// without per-deployment tweaks.
const nextConfig: NextConfig = {
  // Next 16 dev only serves dev resources (JS chunks, the HMR socket) to the
  // origin it initialized with — `localhost`. A request whose Origin is
  // `127.0.0.1` is blocked server-side, so the client JS never loads and the
  // app paints but never hydrates, with no visible error. This app's own
  // Playwright config drives it over `127.0.0.1` (macOS resolves `localhost`
  // to IPv6 `::1` first and can miss a v4-only listener), and AI-agent /
  // sandbox environments commonly resolve `localhost` to `127.0.0.1` too.
  // Allow-listing the loopback origins keeps dev resources served on either.
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  transpilePackages: ["@rosbag2-cloud-offload/shared"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.backblazeb2.com",
      },
    ],
  },
};

export default nextConfig;
