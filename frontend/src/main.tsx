import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initDatadogRum } from './lib/datadog.ts';

// 첫 렌더보다 먼저 불러야 초기 로딩(LCP)과 그 사이 발생한 에러까지 잡힌다.
initDatadogRum();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
