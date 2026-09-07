# 각잡고 BE 가이드 — 스터디룸 · 세션 · 화상 · 감지

> 담당: 백엔드 (스터디룸·세션·실시간·화상)
> 이 문서: 무엇을 만들었고, 어떻게 실행하며, 각 API가 내부적으로 **어떤 함수 흐름**으로 도는지 정리.
> 팀(FE·AI)이 이 백엔드를 사용하기 위한 안내서.

---

## 1. 사용 기술

| 영역 | 기술 | 용도 |
|------|------|------|
| 언어/런타임 | Java 21 | |
| 프레임워크 | Spring Boot 3.3.6 (Web, Validation, Data JPA, Actuator) | REST API |
| ORM | Spring Data JPA / Hibernate | DB 매핑 (스키마는 `schema.sql`이 관리, `ddl-auto: none`) |
| DB | MySQL 8 | 영속 데이터 |
| 화상/음성 | OpenVidu (openvidu-java-client 2.31.0) | 세션 생성·토큰 발급 (WebRTC 릴레이는 OpenVidu가) |
| 실시간 | Spring WebSocket + STOMP | 채팅·참여자·미디어 상태·타이머 페이즈 전파 |
| 인증 | Spring Security + JWT(JJWT, Access/Refresh) + Redis | Refresh 토큰 저장, OAuth 카카오·구글 |
| 메일 | Spring Mail (SMTP) | 비밀번호 찾기·이메일 인증 코드 |
| 리포트 | JFreeChart · OpenHTMLtoPDF · commonmark | 주간 리포트 차트 → 마크다운 → PDF |
| 문서화 | springdoc-openapi (Swagger UI) | API 문서/테스트 |
| 테스트 | JUnit 5 · Mockito | 도메인 단위 테스트 |
| 빌드 | Gradle | |
| 인프라 | Docker Compose (mysql/redis/openvidu/backend/frontend) | 로컬 통합 실행 |
| 부가 | Lombok, record DTO | 보일러플레이트 축소 |

> Redis는 인증(Refresh 토큰)에만 쓴다. 실시간 상태(접속 여부·채팅·미디어)는 **서버 메모리**에 둔다 — 6장 참고.

## 2. 실행 방법

### 방법 A — Docker 전체 (권장, 통합 실행)
```bash
cd project
docker compose up -d --build          # mysql/redis/openvidu/backend/frontend 실행
docker compose ps                     # 상태 확인 (backend healthy 확인)
```
- 스키마 변경 시: `docker compose down -v && docker compose up -d --build` (볼륨 초기화 필요, init은 빈 볼륨에서만 실행)
- 접속: 백엔드 `http://localhost:8080`, 프론트 `http://localhost:5173`

### 방법 B — 로컬 실행 (STS/IntelliJ, 개발 루프 빠름)
- 전제: 로컬 MySQL(3306)에 `protractor` DB + 스키마. OpenVidu는 도커로 띄워야 함(`docker compose up -d openvidu`).
```bash
mysql -u root -p < backend/src/main/resources/schema.sql   # 최초 1회 스키마 적용
cd backend && ./gradlew bootRun                            # 기본 프로필 local 자동 적용
```

### 검증 도구
- **Swagger UI**: `http://localhost:8080/swagger-ui.html` (REST 테스트)
- **화상 테스트**: `http://localhost:5173/video-test` (React) 또는 `http://localhost:8080/openvidu-test.html`
- 스터디룸/스터디기록/스트레칭 API는 JWT가 필요하다. Swagger에서 먼저 로그인 후 `Authorize`에 accessToken을 넣고 실행한다.

## 3. 아키텍처 / 계층 구조

```
com.protractor.backend
├── domain/studyroom/         방 관리 + 입장/퇴장/참여자 + 실시간
│   ├── controller/  StudyRoomController   REST
│   │                ChatController        WS 채팅 수신·중계
│   │                MediaStateController  WS 미디어 상태 수신·중계
│   ├── service/     StudyRoomService        방 CRUD·입퇴장·방장 위임
│   │                StudyRoomTimerService   방 공용 페이즈 진행·전파
│   │                StudyRoomEventPublisher 입퇴장 브로드캐스트
│   │                RoomPresenceTracker     접속 감지·자동 퇴장·중복 세션 정리
│   │                ChatHistoryService      최근 50건 메모리 보관
│   │                MediaStateService       참여자 미디어 상태 메모리 보관
│   └── repository/ entity/ dto/
├── domain/studyrecord/       세션(=참여자기록) + progress/end + 점수 계산
├── domain/stretching/        스트레칭 가이드 + 시작/완료/건너뛰기 이벤트
├── domain/studytag/          공용 학습 태그 목록 (방 개설 카테고리)
└── global/
    ├── openvidu/OpenViduService     OpenVidu 연동
    ├── config/WebSocketConfig       STOMP 엔드포인트(/ws)·브로커·CONNECT 인증
    ├── config/SecurityConfig        JWT 필터 · 공개 경로
    └── health/HealthController
```
**요청 흐름(REST):** `HTTP → Controller(입력검증) → Service(@Transactional, 로직) → Repository(JPA) → MySQL → 응답(record DTO)`

**요청 흐름(WebSocket):** `STOMP SEND /app/... → @MessageMapping → 서비스 → SimpMessagingTemplate → /topic/... 구독자 전원`

## 4. 핵심 개념: study_records = "세션 겸 참여자 기록"

공식 스키마엔 별도 `study_sessions`가 없다. **한 회원이 한 방에서 하루 공부한 것 = `study_records` 1행**
(`uk_study_records_room_member_date (study_room_id, member_id, study_date)` UNIQUE).
- 참여자 정보: `joined_at` / `left_at`
- 세션 통계: `focused/break/away/bad_posture_seconds`, 점수들
- 이 행의 `study_record_id` = **API의 sessionId**. 감지 이벤트(`events`)가 여기에 FK로 붙는다.

**행은 입장할 때 생기고, 종료는 그 행을 UPDATE 할 뿐이다.**

```
입장    INSERT   joined_at, 나머지 0
30초마다 UPDATE  focused/break/away_seconds 덮어쓰기 (점수는 건드리지 않음)
종료     UPDATE  left_at, end_reason + events 집계로 점수 전부 계산
```

- **최소 기록 시간이 없다.** 1초만 있어도, 아무것도 안 해도 행이 남는다.
- UNIQUE 제약 때문에 **같은 날 같은 방에 다시 들어가면 새 행이 아니라 같은 행을 이어쓴다**(`rejoin()`이 `left_at`·`end_reason`만 비운다 — `joined_at`은 그대로 둔다). 점수는 다음 종료 때 전체 기준으로 다시 계산해 덮어쓴다.
- **날짜가 바뀌면 행이 갈린다.** 자정을 넘겨 공부하면 `progress` 동기화 때 어제 행을 `end_reason=DATE_ROLLOVER`로 마감(점수 계산 포함)하고 오늘 행을 새로 만들어, 응답의 `studyRecordId`를 새 값으로 준다. **프론트는 이 값이 바뀌면 갈아타야 한다**(안 갈아타면 다음 호출이 409). 자정 정각이 아니라 다음 동기화 때 감지하므로 최대 30초는 어제 쪽에 남는다.
- 입장 시 기존 행을 찾는 기준은 날짜가 아니라 **"아직 안 나간 기록"이 우선**이다. 날짜로만 찾으면 23:50 입장 후 00:10 새로고침에 새 행이 생겨 정원이 두 번 세어진다.
- 그래서 프론트는 재입장 시 `GET /study-records/{id}`로 기존 `focusedSeconds`를 읽어 **누적값에 더해서** 보내야 한다. 서버는 받은 값을 더하지 않고 덮어쓰기 때문이다.
- `end_reason IS NULL` = 진행 중인 세션.

## 5. API별 동작 · 함수 흐름

### 5-0. 알림 수신 설정 — `/api/v1/members/me/notification-settings`
`GET`은 친구·DM·커뮤니티·문의·공지·리포트·랭킹 알림의 수신 여부를 반환한다. 설정 행이 없는 기존 회원은 모두 `true`로 응답한다. `PATCH`는 보낸 boolean 항목만 바꾸며, 최초 수정 때 `member_notification_settings` 행을 만든다.

### 5-1. 스터디룸 CRUD — `/api/v1/study-rooms`
`GET`(목록, 검색·페이지) · `GET /{id}` · `POST` · `PATCH /{id}` · `DELETE /{id}` · `GET /recommendations`
- 함수 흐름: `StudyRoomController` → `StudyRoomService.create/getList/get/update/delete` → `StudyRoomRepository`
- **목록은 `status`를 안 넘기면 `RUNNING`으로 고정된다.** 대기 중(`WAITING`)이거나 끝난(`ENDED`) 방을 보려면 명시해야 한다. 정렬은 `createdAt`·`title`·`maxMembers`만 받고 그 밖의 값은 `createdAt,desc`로 되돌린다.
- **삭제는 안에 사람이 있어도 된다.** 남은 참여자를 내보내거나 그들의 기록을 닫지는 않는다 — 각자 끊길 때 이탈 경로가 정리한다.
- 방 상태는 인원 수에서 파생된다: 개설 시 `WAITING`(+10분 만료), 첫 입장에 `RUNNING`, 마지막 퇴장에 `ENDED`(+30초 뒤 삭제).
- `GET /recommendations`는 회원 관심 태그와 일치하면서 **입장 가능한 활성 방**을 우선 조회한다(기본 3개, 1~10).
- 특징: **소프트 삭제**(`deleted_at` + `@SQLRestriction`), 기본값(정원 6/집중50분/휴식10분)은 서비스에서 주입, 수정은 **변경 감지(dirty checking)**. 방은 `studyTagId` 하나로 공용 학습 태그를 선택하며, 회원 관심 태그와의 일치로 추천한다. `hashTags`는 자유 입력 문자열이다. `isLocked=true`인 방은 생성·수정 시 `password`가 필요하다.

### 5-2. 입장 — `POST /api/v1/study-rooms/{roomId}/join`
요청 `{ cameraChecked, postureChecked, password? }` + `Authorization: Bearer {accessToken}` → 응답 `{ roomId, memberId, studyRecordId, openviduSessionId, mediaToken }`
```
StudyRoomService.join()
 ├─ findActiveOrThrow(roomId)                       방 존재 검증
 ├─ JWT에서 memberId 추출
	├─ 잠금 방이면 요청 password 일치 여부 확인
 ├─ 기존 기록 조회 (안 나간 기록 우선 → 없으면 오늘 날짜 기록)
 │     있으면 rejoin()(left_at·end_reason 해제) / 없으면 StudyRecord.start() 저장   ← 세션 생성
 └─ OpenViduService.issueToken("study-room-{id}")   OpenVidu 세션 확보 + 토큰
        실패 시 502 + 트랜잭션 롤백(세션 생성도 취소)
```
프론트는 받은 `mediaToken`으로 OpenVidu에 접속(캠 송출). `studyRecordId`는 이후 progress/end·감지에 사용.

### 5-3. 진행 동기화 — `PATCH /api/v1/study-records/{id}/progress`
요청 `{ focusedSeconds, breakSeconds, awaySeconds }`(누적값) + `Authorization: Bearer {accessToken}`
```
StudyRecordService.progress() → StudyRecord.syncProgress()
 └─ 누적값 "덮어쓰기"(append 아님), total = focused+break+away
```
- JWT의 memberId와 studyRecord의 memberId가 다르면 403으로 막는다.
- **덮어쓰기라 크래시에 안전**: 중간에 한 번 놓쳐도 다음 동기화에 전체가 담김. 30~60초 주기 호출 권장. 점수 계산은 안 함(가볍게).

### 5-4. 종료 — `PATCH /api/v1/study-records/{id}/end`
요청 `{ focusedSeconds, breakSeconds, awaySeconds, endReason, postureEvents? }` + `Authorization: Bearer {accessToken}` → 응답: 서버가 계산한 점수 일체

> **졸음·휴대폰 목록은 여기서 받지 않는다.** 둘 다 발생 즉시 저장하는 입구가 따로 있다(5-5). 목록 필드는 "추가"가 아니라
> "그 종류를 전부 지우고 교체"로 동작해서, 빈 배열만 실려 와도 세션 중 쌓인 기록이 통째로 사라지고 응답은 200이 된다.
> 그 실수가 불가능하도록 받을 통로 자체를 없앴다.
```
StudyRecordService.end()
 ├─ StudyRecord.end()                       최종 누적값 + left_at + endReason
 ├─ postureAnalysisService.finish()         열려 있는 자세 이벤트를 닫는다
 │                                           (안 닫으면 그 시간이 bad_posture_seconds에서 빠진다)
 ├─ replaceEvents()                         요청에 이벤트가 담겨 온 경우에만 교체 저장
 │                                           (null이면 서버가 실시간 판정해 둔 events를 그대로 둔다)
 ├─ EventRepository 집계:
 │     findPostureIntervals → 겹치는 구간을 병합한 초(PostureInterval.mergedSeconds)
 │        badPostureSeconds = max(finish()가 돌려준 측정 초, 병합 초)
 │                            그러고도 total을 넘으면 total로 자르고 WARN 로그를 남긴다
 │     countWarnings            → warning_count
 │     countPostureByDetail(FORWARD_HEAD / SHOULDER_TILT / CHIN_REST)
 │     countStretchingAttempts / countStretchingCompleted
 ├─ 점수 계산(임시 공식):
 │     goodPostureRatio  = (focused-badPosture)/focused*100    (focused=0 이면 100)
 │     focusScore        = focused/total*100                    (total=0 이면 0)
 │     neck/chinRest/shoulderTiltScore = 100 - 이벤트수*10
 │     totalScore        = 위 4개 중 goodPostureRatio 를 뺀 나머지 4개
 │                         (focus/neck/chinRest/shoulderTilt)의 평균   (전부 0~100 clamp)
 └─ StudyRecord.applyScores(...)            결과 저장
```
> **점수는 서버가 events로 계산**(클라 신고 불신 = 치팅 방지). 공식은 **임시** — AI 정확도 테스트 후 확정 예정.

**공식의 알려진 한계** (확정 전에 같이 정리할 것)

- 자세 점수 3개는 **이벤트 건수만 본다.** 10분을 공부하든 3시간을 공부하든 거북목 10회면 똑같이 0점이라, 오래 앉아 있을수록 불리하다. 시간당 빈도로 정규화하는 것이 자연스럽다.
- 같은 이유로 **10회에서 바닥을 친다**(clamp). 11회와 50회가 구분되지 않는다.
- 시간 기반 지표인 `goodPostureRatio`를 계산해 저장하면서 **총점에는 넣지 않는다.**
- `focusScore`의 분모 `total = focused+break+away`인데 `break_seconds`가 대개 0으로 들어와 **사실상 100 고정**이다. 결과적으로 총점은 `(100 + 자세점수 3개) / 4`에 가깝다.

- 감지 3종(거북목·어깨 높낮이·턱 괴기)은 `body_part`로 구분되지 않는다(거북목·턱 괴기가 둘 다 NECK). `detail` 값으로 나눈다. 라운드숄더는 판정에서 빠졌다(PostureType·RuleBasedPostureDetector 주석 참고).
- 이미 종료된 세션에 다시 호출하면 **409**. 두 번째 호출이 값을 재계산해 제약을 깨뜨리는 것을 막는다.
- 창을 닫거나 브라우저가 죽어 `end`가 오지 않으면, 서버가 **마지막 progress 값을 확정값으로 삼아** 같은 계산을 수행한다(`endByDisconnect`, `endReason=DISCONNECTED`). 5-8 참고.

### 5-5. 감지 이벤트 저장 (AI 연동)
- 이벤트가 `events` 테이블에 들어오는 경로는 두 가지다.
  1. **서버 실시간 판정** — 프론트가 `POST /api/v1/study-sessions/{id}/posture-frames`로 초당 1회 피처를 보내면, 서버가 30초 지속을 확인해 확정 이벤트를 저장한다. (posture 도메인 = AI 담당)
  2. **종료 시 일괄 전송** — 클라이언트가 자체 판정한 이벤트를 `end` 요청의 `postureEvents`, `drowsinessEvents`에 담아 보낸다.
- **두 경로는 섞이지 않는다.** `end` 요청에 이벤트를 담지 않으면(`null`) 서버가 저장해 둔 이벤트를 지우지 않고 그대로 집계한다. 담아 보내면 그 값으로 교체한다.
- 매 프레임 좌표는 저장하지 않는다. 확정된 이벤트만 남고, 그 이벤트가 5-4 종료 점수의 원천이다.

> 경로 이름 주의: 자세 API는 아직 `/api/v1/study-sessions/{sessionId}`를 쓰고, 세션 API는 `/api/v1/study-records/{studyRecordId}`를 쓴다. **가리키는 값은 같다**(study_record_id). posture 도메인 담당자와 맞출 항목.

### 5-6. 참여자 · 나가기 — `/api/v1/study-rooms/{roomId}/...`
- `GET .../participants` → 안 나간(`left_at IS NULL`) 참여자 배열. 닉네임은 한 번에 모아 조회(N+1 제거)
- `POST .../leave` → 세션 종료(점수 계산 포함) + `left_at` 기록 + 아래 뒷정리

> 방장이 참여자를 내보내는 API는 **없다.** 프론트에 붙은 적이 없었고, 유일하게 점수를 계산하지 않는 경로라
> 세션 종료 흐름이 갈리는 원인이었다. 지금은 **퇴장 경로가 나가기와 이탈 둘뿐**이고 둘 다 같은 결과를 낸다.
> 필요해지면 `endWithStoredProgress`를 거치도록 처음부터 다시 만든다(`DESIGN_DECISIONS.md` 결정 8).

나가기와 이탈은 아래 뒷정리를 거친다.

```
StudyRoomService.leave()
 ├─ endByUserExit()          아직 열려 있으면 세션 종료 + 점수 계산
 │                            (프론트가 end 를 이미 불렀으면 no-op)
 └─ closeOrTransferHost()    ※ 열린 기록이 없어도 반드시 실행한다
     ├─ 남은 인원 0명    → 타이머 정지 후 room.endSession(EMPTY, TTL 30초)
     │                      상태를 ENDED 로 바꾸고 expires_at 을 30초 뒤로 — 삭제는 스케줄러가 한다
     ├─ 나간 사람 ≠ 방장 → 아무것도 안 함
     └─ 나간 사람 = 방장 → 공부시간(focused_seconds) 최다자에게 방장 위임
                            동점이면 먼저 들어온 사람
그 뒤 MediaStateService.remove() + 참여자 토픽으로 LEFT 전파
```

> `closeOrTransferHost()`를 기록 유무와 무관하게 부르는 것은 의도한 것이다. 이탈 경로는 세션을 먼저 마무리하고
> `leave()`를 부르기 때문에, "열린 기록이 없으면 NOT_FOUND"로 만들면 방장 위임과 빈 방 정리가 통째로 건너뛰어져
> 아무도 없는 방이 RUNNING으로 남는다.

### 5-7. 실시간 (WebSocket / STOMP)

접속은 방마다 따로가 아니라 **단일 엔드포인트 `/ws`**. 방 구분은 구독 경로로 한다. 인증은 CONNECT 헤더의 JWT.

| 보내기 (`/app/...`) | 받기 (`/topic/...`) | 내용 |
|---|---|---|
| `study-rooms/{roomId}/messages` | `study-rooms/{roomId}/messages` | 채팅 |
| `study-rooms/{roomId}/media` | `study-rooms/{roomId}/media` | 카메라·마이크·화면공유 상태 |
| — | `study-rooms/{roomId}/participants` | 입퇴장(JOINED/LEFT) + 현재 인원 |
| — | `study-rooms/{roomId}/timer` | 방 페이즈 전환(PHASE_CHANGED) |
| — | `/user/queue/session-evicted` | 중복 접속으로 이 세션이 밀려남 |

- **보낸 사람은 요청 본문이 아니라 STOMP `Principal`에서 서버가 확정한다.** 클라이언트가 남의 이름으로 보낼 수 없다.
- 채팅은 보낸 사람을 포함한 전원에게 되돌려 준다. 클라이언트가 화면에 직접 넣으면 같은 메시지가 두 번 보인다.
- **구독만으로는 그 뒤의 변화만 알 수 있다.** 먼저 들어와 있던 사람·끊긴 동안의 변화·이전 대화는 아래 REST로 한 번 맞춘다.

| REST | 용도 |
|---|---|
| `GET /api/v1/study-rooms/{roomId}/participants` | 현재 참여자 |
| `GET /api/v1/study-rooms/{roomId}/media-states` | 현재 미디어 상태 |
| `GET /api/v1/study-rooms/{roomId}/messages` | 최근 채팅 50건(오래된 순) |

### 5-8. 이탈 감지 — `RoomPresenceTracker`

나가기 버튼을 누르는 경우가 오히려 드물다. X로 닫기·브라우저 강제 종료·네트워크 끊김에서도 **나가기 버튼과 같은 결과**가 나오게 한다.

```
참여자 토픽 구독(SessionSubscribeEvent)  → 접속 중으로 기록
                                          같은 계정의 이전 세션이 있으면 그쪽에 종료 통지 후 정리
연결 끊김(SessionDisconnectEvent)        → 끊긴 시각 기록 (아직 퇴장 아님)
3초마다 sweep()                           → 20초가 지나도 안 돌아오면 퇴장 처리
                                            ├─ endByDisconnect()  세션 종료 + 점수 계산
                                            ├─ leave()            빈 방 ENDED / 방장 위임
                                            └─ 미디어 상태 제거 + LEFT 전파
```

**타이밍 상수는 전부 `RoomLifecyclePolicy`에 모여 있다.** 흩어 두면 한쪽만 고치는 실수가 난다.

| 상수 | 값 | 뜻 |
|---|---|---|
| `DISCONNECT_GRACE` | 20초 | 끊긴 뒤 이만큼 안 돌아오면 퇴장 |
| `SWEEP_INTERVAL_MS` | 3초 | 위 조건을 확인하는 주기 |
| `ENDED_TTL` | 30초 | ENDED가 된 방이 삭제되기까지 |
| `WAITING_TTL` | 10분 | 개설만 하고 아무도 안 들어온 방의 수명 |
| `EXPIRY_SWEEP_INTERVAL_MS` | 10초 | 만료된 방을 치우는 주기 |

- **유예를 두는 이유**: 새로고침도 연결이 한 번 끊긴다. 유예가 없으면 F5가 퇴장으로 처리된다.
- 실제로 자리가 비기까지는 **최대 23초**(유예 20초 + 확인 주기 3초)다. 홈 화면의 "지금 공부 중" 인원이 그 사이 실제보다 조금 크게 보이는 이유다.
- 유예 동안 자리는 유지된다(정원 계산에 포함). 재입장은 정원 검사를 건너뛰므로 3/3인 방에도 본인은 다시 들어올 수 있다.
- 공부 시간은 프론트가 30초 주기 + 창이 닫히는 순간(`pagehide`, `keepalive`)에 `progress`로 저장해 둔 값을 쓴다.

> `ENDED` 전환 경로는 **두 갈래**다 — 명시적 나가기(`closeOrTransferHost`, 유예 없음)와 끊김(`sweep`, 유예 20초).
> **한쪽만 고치면 나가는 방식에 따라 결과가 달라진다.** `DESIGN_DECISIONS.md` 결정 9 참고.

### 5-9. 스트레칭 — `/api/v1/stretchings`, `/api/v1/.../stretchings/...`
- `GET /api/v1/stretchings` → 활성화된 스트레칭 가이드 목록을 `sort_order` 순서로 조회
- `POST /api/v1/study-records/{studyRecordId}/stretchings/{stretchingId}/start` → 스트레칭 시작 이벤트 저장
- `PATCH /api/v1/stretching-events/{eventId}` → 시작된 스트레칭 이벤트를 완료 처리하고 `completionRate` 저장
- `POST /api/v1/study-records/{studyRecordId}/stretchings/{stretchingId}/skip` → 스트레칭 건너뛰기 이벤트 저장
```
StretchingController
 └─ StretchingService
     ├─ StretchingRepository                  활성화된 가이드 조회
     ├─ StudyRecordRepository.findById()      세션 존재 + JWT 소유자 검증
     └─ EventRepository.save/findById()       events에 STRETCHING 이벤트 저장·갱신
```
- 별도 `stretching_events` 테이블 없이 공식 스키마의 `events.stretching_id`, `completion_rate`, `detail`을 사용한다.
- 세션 종료 시 `events`의 `STRETCHING` 행을 집계해 `stretching_attempt_count`, `stretching_completed_count`에 반영한다.

### 5-10. 학습 태그 — `GET /api/v1/study-tags`
방 개설 화면의 카테고리 선택지(`[{ studyTagId, name }]`)를 내려준다. 여기서 고른 값이 방 생성 요청의 `studyTagId`가 된다. 비로그인에도 공개한다(메인 화면의 방 목록 필터).

## 6. 데이터 저장 계층 (무엇을 어디에)

| 계층 | 내용 | 서버 재시작 시 |
|---|---|---|
| **MySQL** | 방·세션(study_records)·감지이벤트(events) — 확정 데이터 | 유지 |
| **Redis** | Refresh 토큰 | 유지 |
| **서버 메모리** | 접속 여부(RoomPresenceTracker), 미디어 상태, 최근 채팅 50건, 타이머 진행 상태 | **소실** |
| **브라우저** | 개인 타이머 진행·MediaPipe 프레임 | — |
| **컨테이너 로컬 디스크** | 프로필 이미지·리포트 PDF·게시판 첨부 (`/app/data`) | 볼륨이면 유지 |

- 원칙: 매초 변하는 값은 DB에 매번 쓰지 않고, **이벤트 / 30초 주기 / 종료 시**에만 저장한다.
- 실시간 상태를 메모리에 둔 것은 **다중 서버로 확장하지 않기로 팀이 정했기 때문**이다. 서버가 여러 대가 되면 Redis로 옮겨야 한다.
- ⚠️ 서버를 재시작하면 채팅 기록과 미디어 상태가 비고, 진행 중이던 방 타이머가 멈춘다. **시연·발표 중 배포 금지.**

## 7. 공통 에러 응답
모든 REST API는 예외 발생 시 아래 형식으로 응답한다. 프론트는 `status`, `code`, `message`, `errors`를 기준으로 화면 메시지나 분기 처리를 하면 된다.

```json
{
  "timestamp": "2026-07-27T14:36:15",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "message": "요청 값이 올바르지 않습니다.",
  "path": "/api/v1/study-rooms",
  "errors": [
    {
      "field": "title",
      "reason": "공백일 수 없습니다",
      "rejectedValue": ""
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `timestamp` | 에러가 발생한 서버 시간 |
| `status` | HTTP 상태 코드 |
| `code` | 프론트 분기용 에러 코드 |
| `message` | 사용자 또는 개발자가 읽을 수 있는 대표 메시지 |
| `path` | 에러가 발생한 요청 경로 |
| `errors` | 필드별 상세 오류 목록. 상세 오류가 없으면 빈 배열 |

### 7-1. 주요 에러 코드
| HTTP | code | 주로 발생하는 상황 |
|------|------|--------------------|
| 400 | `VALIDATION_FAILED` | Request Body 또는 Query Parameter 검증 실패 |
| 400 | `INVALID_PARAMETER_TYPE` | `roomId`에 `abc`처럼 타입이 맞지 않는 값 입력 |
| 400 | `MISSING_REQUIRED_PARAMETER` | 필수 query/path 값 누락 |
| 400 | `MALFORMED_JSON_REQUEST` | JSON 문법 오류 또는 enum 값 오류 |
| 403 | `ACCESS_DENIED` | 방장만 가능한 기능을 일반 참여자가 호출 |
| 404 | `RESOURCE_NOT_FOUND` | 존재하지 않는 `roomId`, `studyRecordId` 조회 |
| 405 | `METHOD_NOT_ALLOWED` | 지원하지 않는 HTTP Method 호출 |
| 409 | `DATA_INTEGRITY_VIOLATION` | DB UNIQUE/FK/CHECK 제약 조건 위반 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | `Content-Type`이 API와 맞지 않음 |
| 502 | `EXTERNAL_SERVICE_ERROR` | OpenVidu 등 외부 서비스 연동 실패 |
| 500 | `INTERNAL_SERVER_ERROR` | 예상하지 못한 서버 내부 오류 |

### 7-2. 보안 처리
- `password`, `secret`, `token`, `key`, `credential`이 포함된 필드명은 에러 응답에서 `rejectedValue`를 `***`로 마스킹한다.
- 너무 긴 입력값은 응답에서 잘라서 내려보낸다.

## 8. 참고 / 아직 안 한 것 (TODO)

**완료** — 스터디룸 CRUD·목록(비로그인 공개)·추천·입장/나가기·참여자·preparation·타이머(설정/시작/정지/진행상태), study-records progress/end·홈 요약, 졸음·휴대폰 이벤트 저장, 스트레칭, 학습 태그, 실시간(채팅·참여자·미디어 상태·타이머 페이즈·중복 세션 정리), 이탈 감지 및 자동 종료, OpenVidu 토큰 발급, 전역 예외 응답

**남은 것**
- 점수 공식: 임시(placeholder) → AI 정확도 테스트 후 확정
- 자세 API 경로(`/study-sessions`)와 세션 API 경로(`/study-records`) 이름 불일치 — posture 담당자와 정리 필요
- 재입장해도 `joined_at`은 그대로지만, 그 사이 자리를 비운 시간이 섞이므로 `joined_at ~ left_at`을 공부 시간으로 쓰면 안 된다. **총량은 `focused_seconds`, 기간 집계는 `study_date`를 봐야 한다.** 랭킹·리포트·알림·학습요약 네 곳이 `study_date`로 기간을 자른다
- 자정을 넘긴 세션의 `awaySeconds`·`breakSeconds`가 `DATE_ROLLOVER` 시 새 행으로 이어지지 않는다
- 관련 문서: `DESIGN_DECISIONS.md`(설계 판단 근거)

## 9. 팀에게 (사용 요약)

**FE**
1. `GET /study-tags`로 카테고리 선택지 → `POST /study-rooms`로 방 생성
2. `POST /study-rooms/{id}/join` → 받은 `mediaToken`으로 OpenVidu 접속, `studyRecordId` 보관
3. `/ws`로 STOMP 연결 → 참여자·채팅·미디어·`/user/queue/session-evicted` 구독
4. **연결될 때마다** participants·media-states·messages를 REST로 한 번 맞춘다(재연결 포함)
5. `PATCH /study-records/{id}/progress`를 30초마다 + `pagehide`에 `keepalive`로 전송
6. 나갈 때 `PATCH .../end` → `POST /study-rooms/{id}/leave`

> `mediaToken`은 **일회용**이다. 새로고침 후에는 `join`을 다시 호출해 새로 받아야 한다.
> `session-evicted`를 받으면 그 화면은 방에서 나가야 한다(카메라·자세 판정 이중 실행 방지).

**AI** — 입장 시 받은 `studyRecordId`(= posture API의 `sessionId`)로 감지 이벤트를 남긴다. 서버 실시간 판정을 쓰는 경우 `end` 요청에 이벤트를 담지 말 것(담으면 서버가 저장해 둔 것을 덮어쓴다).
