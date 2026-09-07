# 각잡고 Frontend

실시간 온라인 자세교정 스터디룸 플랫폼 **각잡고**의 프론트엔드입니다.

## 기술 스택

| 구분        | 사용 기술                          |
| ----------- | ---------------------------------- |
| 빌드 도구   | Vite                               |
| 프레임워크  | React 19 + TypeScript              |
| 라우팅      | React Router v7 (createBrowserRouter) |
| 상태관리    | Zustand                            |
| API 통신    | axios (공통 인스턴스 + 토큰 인터셉터) |
| 린트 / 포맷 | ESLint (flat config) + Prettier    |
| AI          | MediaPipe Tasks Vision (자세·얼굴 랜드마크) |

## 사전 준비

- **Node.js `v24.18.0`** (팀 통일 버전 / LTS)
  - 설치 확인: `node --version`, `npm --version`
  - Windows에서 `npm` 명령이 인식되지 않으면 터미널(또는 VS Code)을 껐다 켜세요.

## 시작하기

```bash
# 1) frontend 폴더로 이동
cd frontend

# 2) 의존성 설치 (clone/pull 후 최초 1회, package.json 변경 시마다)
npm install

# 3) 개발 서버 실행 → http://localhost:5173
npm run dev
```

## npm 스크립트

| 명령                   | 설명                                    |
| ---------------------- | --------------------------------------- |
| `npm run dev`          | 개발 서버 실행 (HMR)                    |
| `npm run build`        | 타입 체크(tsc) + 프로덕션 빌드          |
| `npm run preview`      | 빌드 결과물 로컬 미리보기               |
| `npm run lint`         | ESLint 검사                             |
| `npm run lint:fix`     | ESLint 자동 수정                        |
| `npm run format`       | Prettier 포맷팅 적용                    |
| `npm run format:check` | 포맷 검사만 수행 (커밋/PR 전 확인용)    |

> **커밋 전 권장**: `npm run lint` 와 `npm run format` 을 실행해 주세요.

## 폴더 구조

```
frontend/
├── public/
│   └── mediapipe/       # MediaPipe 모델 파일(.task) — AI 감지에 사용
├── src/
│   ├── api/             # 공통 axios 인스턴스·인터셉터 (client.ts), 도메인별 API 함수
│   ├── assets/          # 이미지 등 정적 자산
│   ├── components/      # 재사용 컴포넌트
│   │   ├── layout/      # 레이아웃 컴포넌트 (RootLayout 등)
│   │   └── ProtectedRoute.tsx  # 인증 라우트 보호
│   ├── hooks/           # 커스텀 훅 (예: usePostureDetection — AI)
│   ├── pages/           # 라우트 단위 페이지 (HomePage, LoginPage ...)
│   ├── router/          # 라우터 설정 (index.tsx)
│   ├── stores/          # Zustand 전역 상태 (useAuthStore 등)
│   ├── styles/          # 전역 스타일
│   ├── types/           # 공용 타입 정의 (auth.ts 등)
│   ├── App.tsx          # RouterProvider 장착
│   ├── main.tsx         # 앱 진입점 (#root 렌더링)
│   └── index.css        # 전역 CSS
├── eslint.config.js     # ESLint 설정 (flat config)
├── .prettierrc          # Prettier 규칙
├── vite.config.ts       # Vite 설정
└── tsconfig*.json        # TypeScript 설정
```

## 인증 / API 통신 구조

모든 REST 통신은 **공통 axios 인스턴스**(`src/api/client.ts`)를 거칩니다.
WebSocket(실시간)은 별도 모듈이며 여기 포함되지 않습니다.

- **`api/client.ts`** — 공통 axios 인스턴스
  - **요청 인터셉터**: 모든 요청에 `Authorization: Bearer <accessToken>` 자동 첨부
  - **응답 인터셉터**: 401 발생 시 `/auth/refresh` 로 토큰 자동 갱신 후 원요청 재시도,
    갱신 실패 시 로그아웃 처리 후 `/login` 이동 (동시 401은 refresh 1회만 실행)
- **`stores/useAuthStore.ts`** — 토큰·회원 정보 전역 상태 (localStorage 영속화)
  - 컴포넌트 밖(인터셉터 등)에서는 `useAuthStore.getState()` 로 접근
- **`components/ProtectedRoute.tsx`** — 인증 필요한 라우트를 감싸는 문지기
  - 미로그인 시 `/login` 으로 리다이렉트하며 원래 경로를 기록 → 로그인 후 복귀

```ts
// 사용 예시
import { api } from '@/api/client';
const { data } = await api.post('/auth/login', { email, password });
useAuthStore.getState().setAuth(data);
```

> 백엔드 인증 API 연동 전까지 `LoginPage` 는 **목(mock) 로그인**을 사용합니다.
> 실제 연동 시 목 부분만 `api.post('/auth/login')` 으로 교체하면 나머지 구조는 그대로 동작합니다.

### 환경 변수 / 프록시

- 개발 서버는 `/api` 요청을 `http://localhost:8080`(백엔드)로 프록시합니다 (`vite.config.ts`).
- API 기본 경로는 `VITE_API_BASE_URL`(기본 `/api/v1`). 필요 시 `.env.example` 을 `.env.local` 로 복사해 수정하세요.

## 코드 컨벤션

- **컴포넌트 / 페이지**: PascalCase (`HomePage.tsx`, `RootLayout.tsx`)
- **스토어 / 훅**: `use` 접두사 camelCase (`useAuthStore.ts`)
- **경로 별칭**: `@` = `src` (`import { api } from '@/api/client'`)
- **라우트 추가**: `src/pages/`에 페이지 생성 → `src/router/index.tsx`의 `children`에 등록
  (보호가 필요하면 `ProtectedRoute` children 아래에 추가)
- **전역 상태**: `src/stores/`에 `create<...>()` 패턴으로 스토어 작성
- **포맷 규칙**: 세미콜론 사용, 작은따옴표, `printWidth 80` (`.prettierrc` 참고)

## 참고

- `useCounterStore` / 홈 화면 카운터는 **상태관리 동작 확인용 샘플**입니다. 실제 도메인 스토어를 붙이면 제거해도 됩니다.
- `public/mediapipe/`의 모델 파일은 AI(자세·졸음 감지) 파트에서 사용합니다.
