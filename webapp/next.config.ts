import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'

const nextConfig: NextConfig = {
  output: isDev ? undefined : 'export',
  trailingSlash: true,
}

if (isDev) {
  nextConfig.rewrites = async () => {
    const apiUrl = process.env.API_URL
    if (!apiUrl) return []
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]
  }
}

export default nextConfig
