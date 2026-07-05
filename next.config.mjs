

const nextConfig = {
  // pdfjs-dist 를 서버 번들에 넣지 않고 node_modules 에서 직접 로드
  // (번들링하면 pdf.worker 경로가 깨져 "fake worker failed" 발생)
  experimental: {
    // unpdf(서버리스용 pdfjs 래퍼) — 번들 대신 node_modules 에서 로드
    serverComponentsExternalPackages: ['unpdf', 'xlsx'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
};

export default nextConfig;
