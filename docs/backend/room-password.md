# 비공개 방 비밀번호 — 백엔드 작업 요청

프론트는 붙였습니다. **서버가 비밀번호를 검사하지 않아 기능이 아직 성립하지 않습니다.**
지금은 잠긴 방에 비밀번호를 물어보고, 무엇을 입력하든(입력하지 않아도) 그대로 들어갑니다.

작성 기준 커밋: `fix/study-room-create-edit`

---

## 지금 상태

### 이미 있는 것

| 항목 | 위치 |
|---|---|
| `study_rooms.is_locked` · `password` 컬럼 | `StudyRoom.java:86-91` |
| 방 생성 시 `isLocked` · `password` 수신 | `CreateStudyRoomRequest.java:31-33` |
| 방 수정 시 변경 | `UpdateStudyRoomRequest.java:26-28` |
| 응답에서 `password` 제외 (`isLocked` 만 노출) | `StudyRoomResponse.java:15` |
| 입장 요청 DTO 의 `password` 필드 | `JoinRoomRequest.java:13` |

### 비어 있는 것

`StudyRoomService.join()` (`:113-151`) 이 **`request.password()` 를 한 번도 읽지 않습니다.**
DTO 에 필드만 뚫려 있고 서비스가 무시합니다.

```java
public JoinRoomResponse join(Long roomId, Long memberId, JoinRoomRequest request) {
    StudyRoom room = findActiveOrThrow(roomId);
    if (!cameraChecked || !postureChecked) throw ...;   // 이 검사만 있음
    // ... 정원 확인 → 기록 생성 → 토큰 발급. 비밀번호 검사 없음
}
```

---

## 요청 사항

### 1. 입장 시 비밀번호 검증 — **필수**

이게 없으면 나머지는 의미가 없습니다.

- `room.isLocked()` 가 `true` 면 `request.password()` 를 대조
- 불일치 또는 누락이면 **403** (401 은 로그인 만료로 오해됩니다 — 프론트가 401 을 받으면 로그인 화면으로 보냅니다)
- 응답 `message` 에 사유를 담아 주세요. 프론트가 그대로 보여줍니다
- **이미 방에 있는 회원의 재입장**은 통과시켜야 합니다. 준비 화면과 스터디룸 새로고침이 각각 `join` 을 다시 부르는데, 여기서 막히면 방에서 튕겨 나갑니다

> 프론트는 이미 `password` 를 실어 보내고 있습니다 (`studyRoomApi.ts` `joinRoom`).
> 공개 방이면 필드 자체를 넣지 않습니다.

### 2. 비밀번호 해싱 — **필수**

지금은 **평문 저장**입니다 (`StudyRoomService.java:68` — `.password(request.password())`).
회원 비밀번호용 인코더가 이미 있으니 같은 것을 쓰면 됩니다.

기존 평문 데이터 마이그레이션도 같이 정해 주세요.

### 3. 생성·수정 시 정합성 검증 — **필수**

- `isLocked = true` 인데 `password` 가 비어 있으면 **400**
  (지금은 그대로 저장돼서 "잠겼는데 비밀번호가 없는 방"이 만들어집니다)
- `isLocked = false` 로 바꿀 때 `password` 를 지울지 결정 필요.
  프론트는 공개 방일 때 `password` 를 **보내지 않습니다.** `update` 가 PATCH 시맨틱이라
  (`StudyRoom.update` 는 null 이 아닌 값만 반영) **이대로면 예전 비밀번호가 남습니다.**

### 4. 형식 검증 — 권장

프론트는 **숫자 4~8자리**로 제한합니다 (`CreateStudyPage.tsx` 의 `PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_LENGTH`).
서버에는 `@Size(max = 255)` 뿐이라 API 를 직접 호출하면 아무 값이나 들어갑니다.
규칙을 서버 기준으로 정해 주시면 프론트 상수를 맞추겠습니다.

### 5. 추천 목록에 `isLocked` — 권장

홈의 "바로 입장 가능한 추천 스터디룸" 응답에는 잠금 여부가 없습니다.
그래서 **그 경로로 들어가는 잠긴 방은 비밀번호를 묻지 않고 넘어갑니다**
(`HomePage.tsx` `handleEnterRoom` 주석 참고). 1번이 붙으면 이 경로는 403 을 받고
입장에 실패합니다 — 사용자는 이유를 알 수 없습니다.

---

## 프론트 동작 (참고)

```
방 카드/상세에서 잠긴 방 클릭
  → RoomPasswordDialog 로 비밀번호 입력          (준비 화면 이전)
  → stashRoomPassword(roomId, password)          여는 창의 메모리에 보관
  → 준비 화면 팝업 열기
  → 팝업이 window.opener 로 읽어 감              (utils/roomPassword.ts)
  → joinRoom(roomId, { ..., password })
```

비밀번호는 **주소창에도 sessionStorage 에도 싣지 않습니다.** 이유는
`frontend/src/utils/roomPassword.ts` 상단 주석에 정리해 두었습니다.

## 1번이 붙은 뒤 프론트가 할 일

- `joinRoom` 403 을 잡아 `RoomPasswordDialog` 에 `error` 로 넘기고 재입력받기
  (다이얼로그에는 `error` prop 이 이미 있고, 지금은 아무도 넘기지 않습니다)
- 준비 화면은 팝업이라 여기서 403 이 나면 창을 닫고 원래 창에 알려야 합니다 — 흐름 재설계 필요
