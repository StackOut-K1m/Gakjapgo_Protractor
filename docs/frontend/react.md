# 프론트엔드 상태관리 · 데이터 저장 · 컴포넌트 구조

"이 값이 지금 어디에 들어 있는지", "새로고침하면 살아남는지", "왜 여기에 뒀는지"를
찾는 용도의 문서입니다. 통신 자체의 흐름은 [request-flow.md](./request-flow.md)를 봐 주세요.

---

## 0. 상태를 담는 네 개의 층

상태 관리 라이브러리는 **zustand 하나**만 씁니다. 서버 상태 캐시 라이브러리(TanStack Query 등)는
쓰지 않고, 그 자리를 자체 훅과 페이지 로컬 상태가 대신합니다.

| 층 | 도구 | 위치 | 담는 것 |
|---|---|---|---|
| 서버 상태 | axios + [useAsync.ts](../../frontend/src/hooks/useAsync.ts), 또는 `useState`+`useEffect` | 페이지·섹션별 | 조회 결과, 로딩·에러 |
| 전역 클라이언트 상태 | zustand | [src/stores/](../../frontend/src/stores/) | 로그인 정보, 방 입장 상태 |
| 화면 로컬 상태 | `useState` | 페이지 컴포넌트 | 다이얼로그 열림, 폼 입력 |
| 고빈도 상태 | `useSyncExternalStore` | [speakingStore.ts](../../frontend/src/stores/speakingStore.ts) | 초 단위로 바뀌는 값 |

### 왜 층이 나뉘어 있나

맨 아래 층이 핵심입니다. 스터디룸에서는 자세 추론이 메인 스레드를 쓰고 있어서,
불필요한 리렌더가 곧바로 **화면 끊김으로 보입니다.**

`speakingStore`는 그래서 zustand가 아닙니다. 말하기 여부는 대화 중 초 단위로 바뀌는데
이 값이 페이지 상태에 들어가면 바뀔 때마다 화상 그리드와 사이드바까지 전부 다시 그려집니다.
페이지 밖에 두고 **참여자별로 구독**하게 해서, 누가 말을 시작해도 그 사람 타일 하나만 다시 그립니다.

```
setSpeaking(id, true)
   ↓
listeners.get(id)   ← 전체가 아니라 해당 참여자의 구독자에게만 알림
   ↓
그 타일 컴포넌트만 리렌더
```

값이 그대로면 아무에게도 알리지 않습니다. 감지기는 주기적으로 호출되므로,
이걸 거르지 않으면 말하지 않는 동안에도 계속 리렌더가 돕니다.

---

## 1. zustand 스토어

| 스토어 | 저장 위치 | 수명 |
|---|---|---|
| [useAuthStore](../../frontend/src/stores/useAuthStore.ts) | localStorage | 로그아웃까지 |
| [useRoomEntryStore](../../frontend/src/stores/useRoomEntryStore.ts) | sessionStorage | 탭을 닫을 때까지 |
| [useFriendStore](../../frontend/src/stores/useFriendStore.ts) | localStorage | (목업) |
| [useCounterStore](../../frontend/src/stores/useCounterStore.ts) | 없음 | (동작 확인용 샘플) |

### 규약

**셀렉터로 값 단위 구독.** 스토어를 통째로 꺼내지 않습니다. 꺼내면 스토어의 아무 값이나
바뀔 때마다 그 컴포넌트가 다시 그려집니다.

```ts
// O
const userName = useAuthStore((s) => s.member?.nickname ?? '');

// X — member 안의 다른 필드가 바뀌어도 리렌더된다
const { member } = useAuthStore();
```

`useIsLoggedIn`, `useFriendStatus` 같은 셀렉터 훅을 스토어 파일에서 같이 내보내
호출부가 매번 셀렉터를 쓰지 않아도 되게 합니다.

**컴포넌트 밖에서는 `getState()`.** axios 인터셉터처럼 훅을 쓸 수 없는 곳에서는
`useAuthStore.getState().accessToken` 으로 읽고 `useAuthStore.setState(...)` 로 씁니다.

---

## 2. 데이터를 어디에 저장하나

브라우저에 남는 값의 전부입니다.

| 저장소 | 키 | 내용 | 언제 사라지나 |
|---|---|---|---|
| localStorage | `auth-storage` | accessToken, refreshToken, member | 로그아웃(`clearAuth`) |
| localStorage | `friend-storage-mock` | 친구 관계 (목업) | 수동 삭제 |
| localStorage | `gakjapgo:voice-guidance` | 음성 안내 on/off | 수동 삭제 |
| sessionStorage | `room-entry` | verifiedRoomId, voiceRoomId, studyRecordId | 탭을 닫을 때 |
| IndexedDB | `gakjapgo-timelapse` | 타임랩스 프레임(얼굴 이미지 Blob) | 다음 세션 저장 시 덮어씀 |
| window(opener) 메모리 | `__gakjapgoRoomPassword` | 방 비밀번호 | 여는 쪽 창을 닫을 때 |
| 모듈 메모리 | — | MediaPipe·YOLO 모델, TTS voice | 새로고침 |
| 모듈 메모리 | — | `boardApi` 목업 Map/Set | 새로고침 |

### 왜 이 저장소를 골랐나

**로그인 정보 → localStorage.** 새로고침해도 로그인이 유지돼야 합니다.
persist 미들웨어가 `auth-storage` 키에 통째로 씁니다.

**방 입장 상태 → sessionStorage.** 새로고침으로 방에서 튕겨 나가지 않게 하되
(같은 탭이라 값이 유지됩니다), 탭을 닫으면 사라져서 다음 입장에 카메라·자세 확인을 다시 거칩니다.
localStorage 였다면 며칠 전 입장 기록으로 방에 바로 들어가 버립니다.

`mediaToken`(OpenVidu 접속 토큰)은 이 스토어에 있지만 **저장하지 않습니다.**
한 번 접속하면 못 쓰는 값이라 `partialize` 로 제외하고, 새로고침 뒤에는 입장 API 를 다시 불러
새 토큰을 받습니다.

```ts
partialize: (state) => ({
  verifiedRoomId: state.verifiedRoomId,
  voiceRoomId: state.voiceRoomId,
  studyRecordId: state.studyRecordId,
}),
```

**음성 안내 → localStorage.** sessionStorage 가 아닌 이유는 스터디룸이 별도 팝업 창이고,
팝업은 창 이름이 재사용될 때 sessionStorage 가 복사되지 않기 때문입니다.
이 값은 방이 아니라 **브라우저에** 붙습니다 — `study_rooms` 에 컬럼이 없어 서버에 저장되지 않으므로
다른 참여자에게는 전달되지 않고 각자 자기 기본값으로 시작합니다.

**타임랩스 프레임 → IndexedDB.** 종료 화면으로는 `navigate(state)` 로 넘어가는데
`history.state` 는 브라우저마다 수백 KB~2MB 상한이 있고 타임랩스는 수 MB 라 조용히 실패합니다.
서버에는 올리지 않습니다 — 얼굴이 담긴 이미지라 보관 동의·수명주기·비용이 전부 따라오는데,
"종료 직후 한 번 돌아보는" 용도라 그만한 값어치가 없습니다.
저장할 때 이전 세션을 지우므로 항상 한 세션분만 남습니다.

**방 비밀번호 → 여는 쪽 창의 메모리.** 준비 화면이 별도 팝업이라 입력받은 값을 그대로 못 씁니다.
나머지를 왜 버렸는지는 [roomPassword.ts](../../frontend/src/utils/roomPassword.ts) 주석에 남아 있습니다 —
쿼리스트링은 방문 기록·서버 로그에 남고, sessionStorage 는 재사용된 팝업에 복사되지 않아
"첫 입장은 되고 두 번째는 안 되는" 버그가 됩니다.

### 모듈 메모리 싱글턴

무거운 모델은 모듈 스코프에 인스턴스와 로딩 Promise를 같이 들고 있어,
여러 곳에서 동시에 요청해도 한 번만 로드합니다.

| 파일 | 담는 것 |
|---|---|
| [poseLandmarker.ts](../../frontend/src/lib/pose/poseLandmarker.ts) | MediaPipe Pose |
| [faceLandmarker.ts](../../frontend/src/lib/pose/faceLandmarker.ts) | MediaPipe Face |
| [yoloPhoneDetector.ts](../../frontend/src/lib/vision/yoloPhoneDetector.ts) | ONNX 휴대폰 감지 세션 |
| [speech.ts](../../frontend/src/lib/speech.ts) | TTS voice |
| [client.ts](../../frontend/src/api/client.ts) | 토큰 갱신 공유 Promise |

---

## 3. 서버 상태를 다루는 방식

캐시 라이브러리가 없어서 두 가지 방식이 섞여 있습니다.

**(1) `useAsync`** — 조회 한 번에 로딩·에러가 따라오는 단순한 화면.
마이페이지 섹션들과 목록 페이지가 이 방식입니다.

```ts
const { data, loading, error } = useAsync(() => getStudyRooms(page), [page]);
```

**(2) `useState` + `useEffect` 직접 작성** — 여러 조회가 서로 얽히거나,
받아온 값을 화면에서 다시 고쳐야 하는 경우. [HomePage](../../frontend/src/pages/HomePage.tsx)와
[StudyRoomPage](../../frontend/src/pages/StudyRoomPage.tsx)가 여기에 해당합니다.

### 알아둘 성질

- **캐시가 없습니다.** 화면을 오갈 때마다 같은 API 가 다시 나갑니다.
  마이페이지 → 홈 이동 시 `getMypageSummary` 를 다시 부릅니다.
- **중복 요청이 합쳐지지 않습니다.** 같은 데이터를 두 컴포넌트가 각자 부르면 요청도 두 번 나갑니다.
- `useAsync` 는 `deps` 가 바뀔 때 다시 부르고, 언마운트 시 `alive` 플래그로 늦게 온 응답을 버립니다.
  다만 `fn` 이 `deps` 에 들어 있지 않으므로(`exhaustive-deps` 를 끄고 있습니다)
  **호출부가 인라인 함수 안에서 바깥 값을 참조하면 옛 값이 잡힐 수 있습니다.**
  변하는 값은 반드시 `deps` 에 넣어 주세요.

---

## 4. 디렉터리 구조

```
src/
├─ api/          엔드포인트별 얇은 래퍼 (타입 + URL). axios 인스턴스는 client.ts 하나만
├─ components/   화면 조각 — 도메인별 폴더 (auth·board·home·mypage·study·layout·ui)
├─ hooks/        React 와 엮인 로직 (카메라·소켓·감지·타이머)
├─ lib/          React 를 모르는 순수 로직 (pose·vision·ws·timelapse)
├─ pages/        라우트 단위 화면
├─ stores/       zustand 전역 상태
├─ types/        DTO·도메인 타입
└─ utils/        포맷·계산 헬퍼
```

### `hooks` 와 `lib` 의 경계

감지 기능은 두 겹으로 나뉩니다. 이 경계를 지키면 판정 로직을 React 없이 테스트할 수 있습니다.

| | 하는 일 | 예 |
|---|---|---|
| `lib/` | 순수 계산. 입력 → 출력 | [postureFeatures.ts](../../frontend/src/lib/pose/postureFeatures.ts), [stretchDetectors.ts](../../frontend/src/lib/pose/stretchDetectors.ts) |
| `hooks/` | 프레임 루프·상태·정리 | [usePostureDetection.ts](../../frontend/src/hooks/usePostureDetection.ts), [useStretchDetection.ts](../../frontend/src/hooks/useStretchDetection.ts) |

### 컴포넌트 규약

- 스타일은 **CSS Modules** (`*.module.css`), `styles['클래스명']` 으로 참조
- 인증이 필요한 라우트는 [ProtectedRoute](../../frontend/src/components/ProtectedRoute.tsx) 로 감쌉니다.
  미로그인 시 `state.from` 에 원래 가려던 위치를 기록해 로그인 후 되돌려보냅니다
- 아이콘은 도메인별 `icons.tsx` 에 인라인 SVG 로 모읍니다

---

## 5. 스터디룸 페이지의 크기

[StudyRoomPage.tsx](../../frontend/src/pages/StudyRoomPage.tsx)는 **1,900줄 · `useState` 25개 ·
`useEffect` 26개**로, 다른 페이지(300줄대)와 규모가 다릅니다. 처음 읽을 때 당황하지 않도록
왜 이렇게 됐는지 적어 둡니다.

이 화면 하나에 다음이 동시에 돕니다.

```
useRoomSocket        참여자·채팅·타이머 (STOMP)
useOpenVidu          화상·음성 (WebRTC)
usePostureFrames     자세 판정 (서버 왕복)
useChinRestDetection / useDrowsinessDetection / usePhoneDetection / useStretchDetection
useDocumentPip       작은 창
useSessionTimelapse  프레임 캡처
useStudyProgressSync 진행 시간 서버 동기화
useVoiceGuidance     음성 안내
```

로직 자체는 훅으로 뽑혀 있습니다. 페이지에 남은 것은 **훅들 사이를 잇는 조율 로직**입니다 —
"자세 경고가 5회 쌓이면 어느 부위 스트레칭을 띄울지", "작은 창이 열려 있으면 코칭 화면을 그리지 말 것",
"스트레칭 중에는 `<video>` 가 하나만 존재해야 하므로 뒤쪽을 비울 것" 같은 것들입니다.

수정할 때 주의할 점:

- **`<video>` 는 한 번에 하나.** 로컬 영상은 그리드 → 코칭 화면 → 스트레칭 오버레이 → 작은 창으로
  옮겨 다닙니다. 렌더 조건(`stretchingOpen`, `pipOpen`)이 서로 배타적인 이유가 이것입니다
- **작은 창이 열려도 사이드바·컨트롤바는 살려 둡니다.** 예전에 `room-body` 를 통째로 덮어
  작은 창을 켜는 순간 채팅을 못 쓰게 된 적이 있습니다
- 상태를 늘릴 때는 **리렌더 범위를 먼저 보세요.** 초 단위로 바뀌는 값이면
  페이지 `useState` 가 아니라 `speakingStore` 방식(외부 스토어 + 부분 구독)을 검토해 주세요

### prop 이 많은 컴포넌트

[RoomControlBar](../../frontend/src/components/study/RoomControlBar.tsx)(18개),
[StudyPipPanel](../../frontend/src/components/study/StudyPipPanel.tsx)(20개)는 prop 수가 많습니다.
작은 창은 본체 컨트롤바와 같은 버튼을 갖되 다른 `document` 에 그려지는 구조라,
`micOn`·`cameraOn`·`voiceGuidanceOn` 과 그 토글 핸들러가 양쪽에 같이 전달됩니다.
한쪽을 고칠 때 다른 쪽도 같이 봐야 합니다.

---

## 6. 임시로 남아 있는 것

지금 코드에 있지만 **정식 구현이 아닌** 것들입니다. 백엔드가 붙으면 걷어냅니다.

| 대상 | 상태 | 비고 |
|---|---|---|
| [useFriendStore](../../frontend/src/stores/useFriendStore.ts) | 목업 | `friendships` 테이블은 있으나 API 가 없음. 화면에서만 돌고 상대에게 전달되지 않음. API 가 붙으면 `PENDING` 상태를 되살려야 함 |
| [useCounterStore](../../frontend/src/stores/useCounterStore.ts) | 샘플 | 동작 확인용 |
| [boardApi](../../frontend/src/api/boardApi.ts) 일부 | 인메모리 목업 | 새로고침하면 초기화 |
| 음성 안내 값 | 브라우저 저장 | `study_rooms` 에 컬럼이 생기면 서버에서 방 기본값을 읽도록 변경 |
| 연속 학습일수 | 하드코딩 | 엔드포인트 없음 |
| [frameStore.ts](../../frontend/src/lib/timelapse/frameStore.ts) 의 `clearTimelapse()` | 미사용 | export 만 되어 있고 호출부가 없어, 마지막 세션의 얼굴 이미지가 로그아웃 뒤에도 IndexedDB 에 남습니다 |