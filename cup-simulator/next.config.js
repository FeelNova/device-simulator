/** @type {import('next').NextConfig} */

const nextConfig = {
  images: {
    unoptimized: false,
  },
  // 允许开发环境中的跨域请求
  allowedDevOrigins: process.env.NODE_ENV === 'development' 
    ? ['192.168.50.112', 'localhost', '127.0.0.1']
    : [],
}

module.exports = nextConfig

