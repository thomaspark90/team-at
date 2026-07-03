

const nextConfig = {
  // pdfjs-dist 를 서버 번들에 넣지 않고 node_modules 에서 직접 로드
  // (번들링하면 pdf.worker 경로가 깨져 "fake worker failed" 발생)
  experimental: {
    serverComponentsExternalPackages: ['pdfjs-dist'],
    // Vercel 서버리스 함수 번들에 pdfjs worker 파일 강제 포함
    // (누락되면 프로덕션에서 "fake worker failed" → 500 → 클라가 HTML을 JSON으로 파싱 실패)
    outputFileTracingIncludes: {
      '/api/finance/parse': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
      '/api/finance/save': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
    },
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
