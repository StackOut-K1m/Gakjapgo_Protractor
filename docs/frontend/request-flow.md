# 프론트엔드 요청 흐름

브라우저가 서버와 주고받는 모든 통신을 한 장에 정리한 문서입니다.
"이 화면에서 뭐가 나가는지", "실패하면 어떻게 되는지"를 찾는 용도입니다.

---

## 0. 통신 수단 3가지

스터디룸에서는 **세 개의 채널이 동시에** 돕니다. 셋은 서로 독립이라 하나가 끊겨도 나머지는 계속 동작합니다.

| 채널 | 용도 | 진입점 |
|---|---|---|
| REST (axios) | 로그인·조회·자세 판정·시간 저장 | [client.ts](../../frontend/src/api/client.ts) |
| WebSocket (STOMP) | 참여자 입퇴장·채팅·마이크/카메라 상태 | [stompClient.ts](../../frontend/src/lib/ws/stompClient.ts) |
| WebRTC (OpenVidu) | 화상·음성 스트림 | [useOpenVidu.ts](../../frontend/src/hooks/useOpenVidu.ts) |

---

## 1. REST 공통 규약

모든 REST 요청은 [client.ts](../../frontend/src/api/client.ts)의 공용 axios 인스턴스 하나를 지납니다.
개별 API 모듈이 axios를 직접 만들지 않습니다 — 토큰 첨부와 갱신이 한 곳에만 있어야 하기 때문입니다.

```
컴포넌트 / 훅
   │  ex) sendPostureFrame(sessionId, features)
   ↓
src/api/*.ts                     엔드포인트별 얇은 래퍼 (타입 + URL 만 담당)
   ↓
src/api/client.ts   api 인스턴스
   ├─ baseURL   VITE_API_BASE_URL ?? '/api/v1'
   ├─ timeout   10초
   ├─ 요청 인터셉터   Authorization: Bearer <accessToken> 자동 첨부
   └─ 응답 인터셉터   401 → 토큰 갱신 → 원요청 1회 재시도
   ↓
[Spring]
```

### 401 처리

```
요청 → 401
      ↓
  _retry 플래그 확인 (이미 재시도했으면 그대로 실패)
      ↓
  refreshAuthToken()          ← 공유 Promise. 동시에 여러 요청이 401 나도 refresh 는 1회만
      ↓
  성공 → 새 토큰으로 원요청 재시도
  실패 → clearAuth() + /login 으로 이동
```

`refreshAuthToken()`은 **WebSocket 재연결도 같이 씁니다.** 방에 가만히 앉아 공부만 하면
REST 요청이 뜸해져 토큰을 갱신할 기회가 없는데, 액세스 토큰은 1시간이고 공부 시간은 그보다 깁니다.



## 2. 화면별 흐름

### 2-1. 로그인 / 온보딩

```
LoginPage        POST /auth/login            → accessToken, refreshToken → useAuthStore
OAuthCallback    POST /auth/oauth/exchange   ← 소셜 로그인은 브라우저를 직접 이동시킨 뒤 코드 교환
OnboardingPage   GET  /onboarding/options    선택지 목록
                 POST /onboarding            제출
                 GET  /onboarding/me         이미 했는지 확인
```

### 2-2. 방 준비 (RoomPreparationPage) — ★ 캘리브레이션

방에 들어가기 **전에** 기준선을 잡습니다. 방 안에서 잡으면 그 몇 초가 바른 자세라는 보장이 없고,
잘못 잡힌 기준선은 세션 내내 오탐·미탐으로 남습니다.

```
GET /study-rooms/{roomId}                방 정보

[카메라 켜기 → 자세 감지 → 'verified' 상태 도달]
        ↓
0.1초마다 피처 수집 (5초간, 최소 10개 표본)
        ↓
averageBaseline(samples)                 표본 평균 → PostureBaseline
        ↓
POST /members/me/calibration             기준선 저장 (회원당 1건, 다시 보내면 덮어씀)
        ↓
[입장 버튼]
        ↓
POST /study-rooms/{roomId}/join          → { studyRecordId, mediaToken }
        ↓
useRoomEntryStore.setVerified(...)  →  navigate('/study/room/{roomId}')
```

> **`studyRecordId`가 이 흐름의 핵심 산출물입니다.** 이후 자세 판정·시간 저장·종료가 전부 이 id를 씁니다.
> join이 실패하면 방 화면에는 들어가되 `studyRecordId`는 **비워 둡니다.** 없는 id를 채우면
> 자세 판정이 매 요청 404를 맞는데 화면은 정상으로 보여서, 원인이 캘리브레이션 문제처럼 보입니다.

기준선을 저장하지 않으면 `POST .../posture-frames`가 **매 요청 404**입니다. 판정 시작 전에 반드시 한 번은 성공해야 합니다.

### 2-3. 스터디룸 (StudyRoomPage)

입장 직후 한 번:

```
GET  /members/me/calibration             기준선 확인 (회원은 토큰에서 푼다)
GET  /study-records/{studyRecordId}      재입장 전까지 이 방에서 공부한 시간(priorFocusedSeconds)
POST /study-rooms/{roomId}/join          (준비 화면을 건너뛰고 URL 로 바로 들어온 경우)
```

이후 주기적으로 도는 것 세 가지:

| 주기 | 무엇 | 어디 |
|---|---|---|
| 매 프레임(~30fps) | 랜드마크 추출 (네트워크 X, 로컬 추론) | [usePoseStream.ts](../../frontend/src/hooks/usePoseStream.ts) |
| 1초 | `POST /study-sessions/{id}/posture-frames` | [usePostureFrames.ts](../../frontend/src/hooks/usePostureFrames.ts) |
| 30초 | `PATCH /study-records/{id}/progress` | [useStudyProgressSync.ts](../../frontend/src/hooks/useStudyProgressSync.ts) |

종료할 때:

```
PATCH /study-records/{studyRecordId}/end   { focusedSeconds, breakSeconds, awaySeconds, endReason }
POST  /study-rooms/{roomId}/leave
```

> `end` 호출이 없으면 `study_records`의 점수 컬럼이 NULL로 남아 **리포트에 쓸 데이터가 만들어지지 않습니다.**
> 이미 종료된 세션에 다시 호출하면 409입니다.

---

## 3. 자세 판정 루프 (가장 자주 도는 경로)

```
[카메라 video 엘리먼트]
        │
        │  requestAnimationFrame — 매 프레임
        ↓
usePoseStream                landmarker.detectForVideo(video)
        │                    ※ 같은 video.currentTime 은 건너뛴다 (detectForVideo 요구사항)
        ↓  NormalizedLandmark[33]
usePostureFrames.handleFrame
        ↓
extractPostureFeatures()     v1 피처 9개 + mlFeatures 블록(12개)
        ↓
   latestFeatures ref 에 덮어쓰기        ← 여기까지는 네트워크 없음
        ┊
        ┊  setInterval 1초
        ↓
POST /study-sessions/{sessionId}/posture-frames   { features, detector }
        ↓
[Spring]  판정기 선택 → 판정 → 30초 윈도우 → 확정/해소
        ↓
PostureFrameResponse { judgements, confirmed, resolved, goodPosture, detector }
        ↓
advanceBadStreaks()          자세별 나쁜 자세 지속 시간 계산 (화면 표시용 근사치)
        ↓
setState → 경고 UI / 스트레칭 트리거
```

**추출은 30fps인데 전송은 1Hz인 이유** — 서버가 30초 지속을 보고 판정하므로 그보다 자주 보낼 이유가 없습니다.
30fps 추출은 화면의 실루엣·하이라이트 표시가 부드러워야 해서 유지합니다.

### 판정을 서버가 하는 이유

점수·랭킹의 원천이라 클라이언트가 보낸 결과를 믿으면 조작이 가능하고,
판정 방식을 여러 개 비교할 때 기기 성능 차이가 변수로 섞이면 안 되기 때문입니다.
브라우저는 **피처 계산까지만** 하고 판정하지 않습니다.

### 전송하지 않는 경우

- 사람이 안 잡힌 프레임 (`features === null`) — 빈 값을 보내면 판정 보류가 통계를 왜곡합니다
- 이전 요청이 아직 응답 전 (`inFlight`) — 응답이 1초보다 오래 걸릴 때 요청이 겹치지 않게 합니다

### 멈추는 조건

| 상황 | 동작 |
|---|---|
| 404 (기준선 없음 / 세션 없음) | **즉시 중단.** 재시도로 풀리지 않습니다 |
| 401 | 인터셉터가 토큰 갱신 후 재시도 |
| 그 외 오류 3회 연속 | 중단 |

중단되면 `state.error`가 채워지고 `running`이 false가 되어 **랜드마커도 같이 멈춥니다**(GPU 낭비 방지).

### 판정 방식 고르기 (개발용)

자세 판정 방식은 여러 가지를 만들어 비교하는 중입니다. 지금은 두 가지가 있습니다.

| 키 | 방식 |
|---|---|
| `rule-based` | 관절 각도·거리를 공식으로 계산. 학습이 필요 없다 |
| `hybrid` | 각도·보류는 규칙 기반이 정하고, **심각도만** 학습된 로지스틱 회귀가 정한다 |

예전에는 서버 설정(`app.posture.detector`)으로만 바꿀 수 있어서 방식을 바꾸려면 서버를 다시 띄워야 했습니다.
그러면 같은 사람이 같은 자세로 두 방식을 비교할 수가 없어서, **요청마다 고르도록** 바꿨습니다.

```
GET /api/v1/posture-detectors
  → [{ key, name, description, isDefault }, ...]
        ↓
DevControls 가 이 목록으로 버튼을 그린다
        ↓
[사용자가 칩 클릭] → dev.detector = 'hybrid'
        ↓
POST .../posture-frames  { features, detector: 'hybrid' }
        ↓
PostureFrameResponse.detector  ← 실제로 판정에 쓰인 값
```

**목록을 프론트에 적지 않습니다.** 서버가 키와 설명까지 내려주므로, 이미지 학습 같은 방식이 새로 추가돼도
**프론트엔드는 고치지 않습니다** — 버튼이 저절로 하나 늘어납니다. 서버 쪽도 `PostureDetector` 구현체 하나만
만들면 되고, 레지스트리·컨트롤러는 그대로입니다.

알아둘 점 네 가지입니다.

- **DEV 빌드에서만 보입니다.** `import.meta.env.DEV`는 빌드 시점에 값이 박히는 상수라,
  `npm run dev`에서는 패널이 뜨고 `npm run build`(Docker 이미지)에서는 컴포넌트 자체가 번들에서 빠집니다.
  프로덕션에서는 `detector`가 항상 `null`이라 서버 기본값으로 판정됩니다.
- **응답의 `detector`는 보낸 값이 아니라 쓰인 값입니다.** 지정하지 않으면 서버 기본값이 돌아오므로,
  선택이 반영됐는지는 이 값으로 확인합니다. DEV 패널의 "판정 중" 줄이 그것입니다.
- **모르는 키는 400입니다.** 기본값으로 조용히 넘기면 오타 하나로 실험 내내 엉뚱한 판정기가
  도는데도 화면에는 아무 표시가 없어, 실험이 끝난 뒤에야 알게 됩니다.
- **방식을 바꿔도 1초 전송 주기는 다시 시작하지 않습니다.** 훅이 `detector`를 ref로 읽기 때문입니다.
  주기가 초기화되면 같은 자세를 유지한 채 방식만 비교하려는 목적과 어긋납니다.

어떤 방식으로 판정했는지는 서버가 `events.metadata`에 판정기 이름(`hybrid-logistic-v1` 처럼 버전 포함)으로
남깁니다. 나중에 방식별 정확도를 맞대볼 때 이 값으로 나눕니다.

---

## 4. WebSocket (STOMP)

```
연결   ws(s)://<host>/ws          SockJS 아님, 순수 WebSocket
인증   CONNECT 프레임의 Authorization: Bearer <accessToken>
구독   /topic/...        전송   /app/...
재연결 5초 뒤 자동 (구독은 사라지므로 onConnect 에서 매번 다시 건다)
```

| 구독 | 내용 |
|---|---|
| `/topic/study-rooms/{roomId}/participants` | 입장·퇴장 |
| `/topic/study-rooms/{roomId}/messages` | 채팅 |
| `/topic/study-rooms/{roomId}/media` | 카메라/마이크 on·off |
| `/user/queue/session-evicted` | 같은 계정이 다른 탭에서 이 방에 들어옴 → 이 화면은 나감 |

### 구독 + REST 스냅샷 조합 ★

구독만으로는 **"그 뒤에 일어난 일"만** 알 수 있습니다. 그래서 연결될 때마다 REST로 현재 상태를 한 번 맞춥니다.

```
onConnect
   ├─ 구독 4개 등록
   └─ 구독을 건 뒤에 스냅샷 요청 (순서 중요 — 그 사이 변화를 놓치지 않으려고)
        ├─ GET /study-rooms/{roomId}/participants
        ├─ GET /study-rooms/{roomId}/media-states
        └─ GET /study-rooms/{roomId}/messages       ← id 로 중복 제거
```

이 과정으로 **먼저 들어와 있던 사람 / 끊긴 동안의 변화 / 새로고침 전 대화**가 복구됩니다.
재연결 때도 똑같이 실행되어 끊긴 동안을 따라잡습니다.

스냅샷이 실패해도 화면을 막지 않습니다 — 이후 변화는 실시간 이벤트로 들어옵니다.

---

## 5. 공부 시간 저장 (유실 방지)

종료할 때 한 번만 보내면 창을 닫거나 브라우저가 죽었을 때 그 세션이 통째로 사라집니다.
나가기 버튼을 누르는 경우가 오히려 드물어서 **세 겹으로** 저장합니다.

```
① 30초마다      PATCH /study-records/{id}/progress   (axios)
② 창이 닫힐 때   PATCH /study-records/{id}/progress   (fetch + keepalive)
③ 종료 버튼     PATCH /study-records/{id}/end
```

②가 `fetch`인 이유: 페이지가 사라지는 중에는 일반 XHR이 취소될 수 있어 `keepalive`가 필요합니다.
`progress`는 **받은 값으로 덮어쓰는** API라 여러 번 보내도 시간이 부풀지 않습니다.
①이 실패해도 무시합니다 — 다음 주기에 다시 보내고, 공부는 계속돼야 하니까요.

---

## 6. 엔드포인트 목록

`baseURL = /api/v1`

| 도메인 | 엔드포인트 | 모듈 |
|---|---|---|
| 인증 | `POST /auth/signup` `/auth/login` `/auth/logout` `/auth/refresh` `/auth/oauth/exchange` `/auth/password` `/auth/password/find` | [authApi.ts](../../frontend/src/api/authApi.ts) |
| 온보딩 | `GET/POST /onboarding` `GET /onboarding/options` `GET /onboarding/me` | [onboardingApi.ts](../../frontend/src/api/onboardingApi.ts) |
| 스터디룸 | `GET/POST /study-rooms` `GET /study-rooms/{id}` `POST /study-rooms/{id}/join` `/leave` `GET /study-tags` | [studyRoomApi.ts](../../frontend/src/api/studyRoomApi.ts) |
| 세션 기록 | `GET /study-records/{id}` `PATCH /study-records/{id}/progress` `/end` | [studyRecordApi.ts](../../frontend/src/api/studyRecordApi.ts) |
| 자세 | `POST /study-sessions/{id}/posture-frames` `GET/POST /members/me/calibration` `GET /posture-detectors` | [postureApi.ts](../../frontend/src/api/postureApi.ts) |
| 스트레칭 | `GET /stretchings` | [stretchingApi.ts](../../frontend/src/api/stretchingApi.ts) |
| 마이페이지 | `GET /mypage/summary` `/mypage/stats` `/mypage/study-rooms` `GET /members/me` | [mypageApi.ts](../../frontend/src/api/mypageApi.ts) |
| 리포트 | `GET /reports/me` `/reports/me/summary` `/reports/me/{id}` `/reports/me/{id}/download` | [reportApi.ts](../../frontend/src/api/reportApi.ts) |
| 커뮤니티 | `GET/POST /boards/posts` | [boardApi.ts](../../frontend/src/api/boardApi.ts) |
| 일정 | `GET/POST /schedules` | [scheduleApi.ts](../../frontend/src/api/scheduleApi.ts) |

---

## 7. 새 API를 추가할 때

1. `src/api/<도메인>Api.ts`에 함수를 추가합니다. **공용 `api` 인스턴스를 import** 하세요 (axios 직접 생성 금지 — 토큰 자동 첨부와 401 재시도를 놓칩니다).
2. 요청·응답 타입은 `src/types/`에 둡니다.
3. 화면에서 직접 부르지 말고 훅(`src/hooks/`)을 거치면, 주기 실행·정리(cleanup)·에러 상태를 한 곳에서 다룰 수 있습니다.
4. 에러 문구는 `getApiErrorMessage(e, fallback)`을 쓰세요.

---

## 관련 문서

- [백엔드 자세 판정 흐름](../backend/posture-analysis.md) — 이 문서의 `posture-frames` 요청이 서버에서 어떻게 처리되는지
