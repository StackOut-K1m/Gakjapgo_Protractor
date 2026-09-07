# 온보딩 감지 동의 — 백엔드 작업 요청

**미동의 상태로 온보딩이 완료됩니다.** 프론트는 막았지만 API 를 직접 호출하면 그대로 통과합니다.

작성 기준 브랜치: `fix/study-room-create-edit`

---

## 무슨 일이 있었나

온보딩 4단계의 `졸음 감지` · `자세 감지` 토글을 **둘 다 OFF 로 두고**
아래 `위 내용에 동의합니다` 체크 하나만 눌러도 가입이 끝났습니다.

프론트 원인은 제출 조건에 두 토글이 아예 없었던 것이고, 고쳤습니다
(`OnboardingPage.tsx` — `detectionConsented` 추가, 버튼 비활성화 + 제출 시 재검사).

**그런데 서버도 막지 않습니다.**

---

## 서버 쪽 문제

`OnboardingSaveRequest.java:24-28`

```java
@NotNull(message = "자세 감지 동의 여부는 필수입니다.")
Boolean postureDetectionConsent,

@NotNull(message = "졸음 감지 동의 여부는 필수입니다.")
Boolean drowsinessDetectionConsent,
```

`@NotNull` 은 **"값이 있어야 한다"**일 뿐 **"true 여야 한다"**가 아닙니다.
`false` 를 보내면 검증을 통과하고, `OnboardingService` 도 값을 그대로 저장합니다
(`:91-92`, `:114-115` — 동의 여부를 보는 분기 없음).

메시지가 "동의 여부는 필수입니다"라 **동의를 강제하는 것처럼 읽히는 것도 문제**입니다.
읽는 사람은 이미 막혀 있다고 생각하게 됩니다.

### 재현

```http
POST /api/v1/onboarding
{
  "purposes": ["취업"],
  "postureDetectionConsent": false,
  "drowsinessDetectionConsent": false
}
→ 200. 미동의 상태로 온보딩 완료 처리됨
```

---

## 요청 사항

### 1. 저장(POST) 시 `true` 강제 — **필수**

```java
@AssertTrue(message = "자세 감지에 동의해야 시작할 수 있습니다.")
Boolean postureDetectionConsent,

@AssertTrue(message = "졸음 감지에 동의해야 시작할 수 있습니다.")
Boolean drowsinessDetectionConsent,
```

> `@AssertTrue` 는 `null` 을 통과시킵니다. `@NotNull` 을 같이 두거나
> 서비스에서 `Boolean.TRUE.equals(...)` 로 확인해 주세요.

`postureCaptureConsent`(자세 캡처 저장)는 **선택 항목이므로 그대로 두면 됩니다.**
화면에도 선택으로 표시됩니다.

### 2. 수정(PATCH)은 그대로 둡니다 — 철회는 허용

`OnboardingUpdateRequest` 는 `false` 를 받아 **동의를 철회**시킵니다.
주석에 의도가 분명히 적혀 있고(`"동의는 false로 보내면 철회되며, 변경 시각이 함께 남는다"`)
**철회권을 보장하는 기능이 맞다고 확인받았습니다. 바꾸지 않습니다.**

대신 **철회가 아무 일도 없이 넘어가서는 안 된다**는 것이 이번에 정해진 규칙입니다.

```
가입 시  → 동의 필수 (1번으로 막힘)
가입 후  → 철회 가능. 단 철회 상태로는 스터디룸에 입장할 수 없다
         → 입장 시도 시 재동의 안내
```

### 3. 철회 상태 확인 수단 — **필요**

프론트가 입장 전에 "이 사용자가 지금 동의 상태인가"를 알아야 합니다.
`GET /onboarding/me` 가 `postureDetectionConsent` · `drowsinessDetectionConsent` 를
이미 내려주므로 **추가 API 없이 가능해 보입니다.** 다른 경로가 더 적절하면 알려주세요.

서버에서도 막아야 하는지는 판단이 필요합니다. 화면만 막으면 API 직접 호출로 우회됩니다.
`POST /study-rooms/{id}/join` 에서 미동의 회원을 403 으로 거부하는 방법이 있습니다
(`room-password.md` 의 비밀번호 검증과 같은 자리라 같이 하면 편합니다).

---

## 남은 프론트 문제 (참고)

철회를 허용하기로 한 이상, 화면도 철회 상태를 존중해야 합니다. 지금은 두 감지가 다르게 동작합니다.

- **졸음 감지** — 동의를 확인하고 끕니다 (`StudyRoomPage` 의 `drowsinessConsent === true`)
- **자세 감지** — 확인하지 않고 그냥 돌아갑니다. **철회해도 계속 감지됩니다**

입장 자체를 막으면 대부분 가려지지만, 이미 방에 있는 동안 철회하는 경우가 남습니다.
프론트에서 처리할 항목입니다.

---

## 참고

프론트는 이미 아래를 막고 있습니다. 서버가 1번을 받아들여도 화면 동작은 바뀌지 않습니다.

- 두 토글 중 하나라도 OFF → `시작하기` 버튼 비활성화
- 버튼이 왜 안 눌리는지 안내 문구 표시
- 제출 함수에서 한 번 더 검사(화면 상태만 믿지 않음)
