import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // onnxruntime-web 은 wasm 로더(.mjs)를 런타임에 동적 import 한다.
  // Vite 가 이를 사전 번들링하면 로더 경로에 ?import 가 붙어 로딩이 실패하므로 제외한다.
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 5173이 이미 점유돼 있으면 조용히 5174로 넘어가지 않고 즉시 실패한다.
    // 백엔드 CORS 허용 목록(app.cors.allowed-origins)이 5173 기준이라,
    // 다른 포트로 뜨면 모든 API 요청이 403 Invalid CORS request 로 막힌다.
    strictPort: true,
    proxy: {
      // 개발 중 /api 요청을 백엔드(로컬 8080)로 전달 → CORS 회피
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // WebSocket(STOMP) 연결도 백엔드로 넘긴다. ws: true 가 없으면 업그레이드 요청이 프록시되지 않는다.
      '/ws': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
