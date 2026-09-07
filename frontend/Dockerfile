# 1단계: React(Vite) 앱을 정적 파일로 빌드한다.
FROM node:22-alpine AS build
WORKDIR /app

# 의존성 먼저 설치한다. lockfile 기반이라 재현 가능하고, 소스만 바뀌면 이 레이어는 캐시된다.
COPY package.json package-lock.json ./
RUN npm ci

# 소스 전체를 복사한다.
COPY . .

# MediaPipe wasm/모델은 용량이 커서 git에 없다(.gitignore).
# 자세 감지가 동작하려면 dist 에 포함돼야 하므로 빌드 전에 받아온다.
# (npm ci 단계에서 하지 않는 이유: 그 시점에는 scripts/ 가 아직 복사되지 않는다)
RUN npm run setup:mediapipe

# Datadog RUM 키. Vite 는 VITE_* 를 빌드 시점에 번들 안으로 박기 때문에 컨테이너 런타임
# 환경변수로는 절대 들어가지 않는다. 반드시 여기서 --build-arg 로 받아야 한다:
#   docker build --build-arg VITE_DD_RUM_APP_ID=... --build-arg VITE_DD_RUM_CLIENT_TOKEN=... .
# 안 넘기면 빈 값이 되고 RUM 은 그냥 꺼진 채로 빌드된다(에러 아님).
ARG VITE_DD_RUM_APP_ID=
ARG VITE_DD_RUM_CLIENT_TOKEN=
ARG VITE_DD_SITE=
ENV VITE_DD_RUM_APP_ID=$VITE_DD_RUM_APP_ID \
    VITE_DD_RUM_CLIENT_TOKEN=$VITE_DD_RUM_CLIENT_TOKEN \
    VITE_DD_SITE=$VITE_DD_SITE

# 프로덕션 빌드 → /app/dist 생성 (build = tsc -b && vite build)
RUN npm run build

# 2단계: 빌드된 정적 파일을 nginx로 서빙한다. (JRE/Node 런타임 불필요 → 이미지가 가볍다)
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
