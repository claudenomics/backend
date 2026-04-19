const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.privy.io https://auth.privy.io https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.privy.io https://auth.privy.io https://*.privy.systems wss://*.privy.io https://*.rpc.privy.systems",
  "frame-src https://*.privy.io https://auth.privy.io https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@claudenomics/attestation', '@claudenomics/auth', '@claudenomics/privy', '@claudenomics/receipts', '@claudenomics/store'],
  webpack: config => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
  async rewrites() {
    return [
      { source: '/.well-known/jwks.json', destination: '/api/well-known/jwks.json' },
    ]
  },
  async headers() {
    return [
      {
        source: '/cli-auth',
        headers: [
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type' },
          { key: 'Access-Control-Max-Age', value: '86400' },
        ],
      },
    ]
  },
}

export default nextConfig
