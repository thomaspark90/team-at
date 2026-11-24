

const nextConfig = {
  // pdfjs-dist 를 서버 번들에 넣지 않고 node_modules 에서 직접 로드
  // (번들링하면 pdf.worker 경로가 깨져 "fake worker failed" 발생)
  experimental: {
    // unpdf(서버리스용 pdfjs 래퍼) — 번들 대신 node_modules 에서 로드
    serverComponentsExternalPackages: ['unpdf', 'xlsx'],
  },
  // 2026-11-24 필터 레시피 화면 주소를 /garden/filtercoffee 로 바꿨다 — 예전 주소(즐겨찾기·태블릿 보드·알림 메일)는 넘겨 준다
  async redirects() {
    return [
      { source: '/garden/recipes', destination: '/garden/filtercoffee', permanent: false },
      { source: '/garden/recipes/:path*', destination: '/garden/filtercoffee/:path*', permanent: false },
    ];
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
