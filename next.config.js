/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.fotmob.com',
        pathname: '/image_resources/**',
      },
    ],
    unoptimized: false,
  },
  // Allow cross-origin requests from local network during development
  allowedDevOrigins: [
    'localhost',
    '127.0.0.1',
    '192.168.1.50',
    '192.168.1.51',
    '192.168.1.52',
    '192.168.1.53',
    '192.168.1.54',
    '192.168.1.55',
    '192.168.1.56',
    '192.168.1.57',
    '192.168.1.58',
    '192.168.1.59',
    '192.168.1.60',
    // Add more IPs as needed for other devices on your network
  ],
}

module.exports = nextConfig
