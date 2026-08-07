import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

// 파서·정규화 등 순수 로직 유닛테스트 설정. 실행: npm test
const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { '@': root } },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
