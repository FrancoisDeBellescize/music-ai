/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      allowedOrigins: ["*"]
    }
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'flat.io' },
      { protocol: 'https', hostname: 'api.flat.io' }
    ]
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" }
      ]
    }
  ]
}

export default nextConfig


