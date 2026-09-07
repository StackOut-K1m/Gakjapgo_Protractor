# 음성 녹음 방 — 백엔드 작업 요청

프론트는 붙였습니다. **서버에 필드가 없어 아직 아무 동작도 하지 않습니다.**
컬럼 하나만 생기면 바로 켜집니다.

작성 기준 브랜치: `fix/study-room-create-edit`

---

## 지금 상태

### 음성 녹음 여부가 서버에 없습니다

`study_rooms` 테이블, `StudyRoom` 엔티티, 생성·수정 DTO 어디에도 관련 필드가 없습니다
(백엔드 전체 검색 결과 0건).

`CreateStudyPage.tsx` 주석에 이유가 남아 있습니다:

> 유형/시작·종료일/음성녹음은 BE로 보내지 않는다(… 음성녹음은 **프론트 라우팅용**)

지금 이 정보가 사는 곳은 **방을 만든 사람의 브라우저 탭** 하나뿐입니다:

```ts
// useRoomEntryStore — sessionStorage
voiceRoomId: string | null   // 음성 녹음 ON 으로 개설된 방 id
```

sessionStorage 라 탭을 닫으면 사라지고, **다른 사용자에게는 처음부터 없습니다.**

### 그래서 참여자는 동의서를 볼 수 없었습니다

`VoiceConsentPage` 가 개설자 본인만 통과시키고 나머지는 방 개설 화면으로 돌려보내고 있었습니다.
즉 동의서가 "개설자가 만들자마자 한 번 보는 화면"이었지, 참여자용 관문이 아니었습니다.

---

## 요청 사항

### 1. `voice_recording_enabled` 컬럼 — **필수**

`stretching_enabled` 와 성격이 같습니다. 그대로 따라가면 됩니다.

| 위치 | 내용 |
|---|---|
| 테이블 | `study_rooms.voice_recording_enabled BOOLEAN NOT NULL DEFAULT false` |
| 엔티티 | `StudyRoom.voiceRecordingEnabled` |
| 생성 요청 | `CreateStudyRoomRequest.voiceRecordingEnabled` (미지정 시 false) |
| 수정 요청 | `UpdateStudyRoomRequest.voiceRecordingEnabled` |
| 상세 응답 | `StudyRoomResponse.voiceRecordingEnabled` |
| 목록 응답 | `StudyRoomSummary.voiceRecordingEnabled` |

**프론트는 이미 `voiceRecordingEnabled` 라는 이름으로 보내고 있습니다.**
Jackson 기본 설정이 모르는 필드를 버리기 때문에 지금은 조용히 무시됩니다 —
컬럼이 생기는 순간 그대로 저장됩니다. 필드명이 다르면 알려주세요.

### 2. 목록 응답에도 포함 — **필수**

상세 응답만 있으면 홈 카드·목록 카드에 "녹음 방" 표시를 못 합니다.
사용자가 들어가 보기 전에 알 수 있어야 합니다.

### 3. 동의 기록 저장 — 권장

동의서에 선택 항목이 하나 있습니다(`서비스 품질 개선을 위한 데이터 활용`).
누가 무엇에 동의했는지 남겨야 한다면 저장 API 가 필요합니다.
지금은 `VoiceConsentPage` 에 `TODO: API 연동 — 선택 항목(improvement) 동의 여부 서버 전달`
로만 남겨 두었습니다.

법적 근거로 쓸 기록이면 **동의 시각·항목·회원 id** 가 필요할 텐데, 이건 기획 확인이 먼저입니다.

---

## 프론트 동작 (참고)

컬럼이 생기면 아래 순서가 바로 동작합니다. 프론트 추가 작업은 없습니다.

```
방 상세에서 입장하기
  → 음성 녹음 방?  → 동의서 (필수 항목 체크)
  → 잠긴 방?       → 비밀번호 입력
  → 준비 화면 팝업
```

- **동의서가 비밀번호보다 먼저**입니다. 녹음에 동의하지 않으면 그 방에는 아예 못 들어가는데,
  비밀번호를 먼저 받으면 거절할 사람에게 비밀번호부터 물은 꼴이 됩니다.
- **비밀번호는 준비 화면보다 먼저**입니다. 카메라를 켜고 자세를 잡은 뒤 되돌려 보내면
  그 준비가 통째로 헛수고가 됩니다.
- 방을 방금 만든 사람은 자기가 정한 비밀번호를 다시 묻지 않습니다.
- 동의를 거절하면 개설자는 개설 화면으로, 참여자는 보던 방 상세로 돌아갑니다.

## 이 문서와 같이 볼 것

- `docs/backend/room-password.md` — 비공개 방 비밀번호. **입장 시 검증이 없어
  잠긴 방도 그냥 들어가지는 상태**라 그쪽이 더 급합니다.
