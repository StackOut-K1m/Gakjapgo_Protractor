# backend

각잡고(protractor) 백엔드. 웹캠 기반 온라인 스터디룸 플랫폼의 Spring Boot 서버입니다.

## 기술 스택

- Java 21, Spring Boot 3.3.6, Gradle
- Spring Data JPA / Hibernate, MySQL 8
- OpenVidu (화상·음성 세션 및 접속 토큰 발급)
- Spring WebSocket + STOMP (채팅·참여자·미디어 상태·타이머 페이즈 실시간 전파)
- Spring Security + JWT, Redis (Refresh 토큰 저장)
- springdoc-openapi (Swagger UI), Spring Actuator

DB 테이블은 JPA가 생성하지 않고(`ddl-auto: none`) `src/main/resources/schema.sql`로 관리합니다.

## 실행

### 로컬 실행

로컬 MySQL(3306)에 `protractor` 데이터베이스와 스키마가 필요합니다.

```bash
mysql -u root -p < src/main/resources/schema.sql
```

DB 계정은 Git에 올라가지 않는 `src/main/resources/application-local.yml`에 작성합니다.

```yaml
spring:
  datasource:
    username: root
    password: 본인 MySQL 비밀번호
```

기본 프로필이 `local`이므로 STS에서 `BackendApplication`을 그대로 실행하면 됩니다.
Gradle로 실행할 경우:

```bash
./gradlew bootRun
```

화상 기능을 확인하려면 OpenVidu 컨테이너가 실행 중이어야 합니다.

### Docker 실행

`docker-compose.yml`은 인프라 담당이 별도로 관리합니다(레포에 포함되지 않음).
백엔드 컨테이너는 `Dockerfile`로 빌드되며, `docker` 프로필이 활성화되어
`src/main/resources/application-docker.yml` 설정을 사용합니다.

## 동작 확인

Swagger UI에서 전체 API를 확인하고 호출할 수 있습니다.

```http
GET http://localhost:8080/swagger-ui.html
```

서버 상태 확인:

```http
GET http://localhost:8080/actuator/health
```

## 구현된 API

- **스터디룸** `/api/v1/study-rooms` — 목록(검색·페이지네이션, 비로그인 공개), 상세, 추천, 생성, 수정,
  삭제(소프트), 비밀번호 확인, 입장, 나가기, 참여자 목록, 입장 준비 정보,
  타이머 설정 조회·변경·시작·정지·진행상태, 최근 채팅 조회, 미디어 상태 조회
- **스터디 세션** `/api/v1/study-records` — 진행 동기화, 종료(점수 계산), 상세 조회, 홈 학습 요약
- **집중 방해 감지** `/api/v1/study-sessions/{sessionId}` — 졸음·휴대폰 이벤트 즉시 저장
- **스트레칭** `/api/v1/stretchings` — 가이드 목록, 시작·완료·건너뛰기 이벤트
- **학습 태그** `/api/v1/study-tags` — 방 개설 카테고리 선택지 (비로그인 공개)
- **실시간** `/ws` (STOMP) — 채팅, 참여자 입퇴장, 미디어 상태,
  방 타이머 페이즈 전파, 중복 접속 세션 종료 통지

방에 입장하면 세션(`study_record`)이 생성되고, 응답의 `studyRecordId`를 이후 세션 API에서 사용합니다.
`mediaToken`으로는 프론트가 OpenVidu에 접속합니다(일회용 — 새로고침 후에는 다시 입장 호출).

WebSocket 연결은 서버가 접속 여부를 판단하는 기준이기도 합니다. 끊긴 뒤 20초 안에 돌아오지 않으면
서버가 세션을 종료하고(공부 시간·점수 저장) 방에서 내보냅니다. 새로고침을 퇴장으로 보지 않기 위한 유예입니다.
확인은 3초마다 돌므로 실제로 자리가 비기까지는 최대 23초가 걸립니다. 타이밍 상수는 `RoomLifecyclePolicy`에 모아 두었습니다.

호출 순서와 저장 위치는 [docs/API_GUIDE.md](docs/API_GUIDE.md),
설계 판단 근거는 [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md)를 참고하세요.

## 설정

`application.yml`에는 비밀값을 넣지 않고 환경변수 placeholder만 둡니다.

| 환경변수 | 용도 |
|---|---|
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | DB 접속 |
| `REDIS_HOST`, `REDIS_PORT` | Refresh 토큰 저장소 |
| `JWT_SECRET` | 토큰 서명키 (HS256, 최소 32바이트) |
| `OPENVIDU_URL`, `OPENVIDU_SECRET` | 화상 서버 접속 |
| `CORS_ALLOWED_ORIGINS` | 허용할 프론트 origin (WebSocket 허용 origin에도 사용) |

> OpenVidu 개발용 이미지(`openvidu-dev`)는 HTTP로 서비스하므로 `OPENVIDU_URL`을
> `https://`로 지정하면 연결이 실패합니다.

## 진행 중 / 미구현

- 강제 퇴장은 이번 버전에서 뺐습니다 (`docs/DESIGN_DECISIONS.md` 결정 8)
- 세션 점수 산정 공식은 임시값입니다(AI 감지 정확도 테스트 후 확정).
  자세 점수가 공부한 시간이 아니라 **이벤트 건수만** 보기 때문에 오래 앉아 있을수록 불리합니다
- 음성 녹음은 이번 버전에서 다루지 않습니다 (`docs/issues/voice-recording.md`)
- 화이트보드는 이번 버전에서 뺐습니다 (`docs/DESIGN_DECISIONS.md` 결정 4)
- 채팅 기록·미디어 상태·타이머 진행 상태는 **서버 메모리**에 둡니다.
  재시작하면 비므로 시연 중 배포는 피하세요 (다중 서버로 확장하지 않기로 한 팀 결정에 따른 선택)



## 아키텍처

┌────────────── 브라우저 (React + TypeScript) ──────────────┐
│                                                            │
│  웹캠 ─┬─→ OpenVidu ──────────────→ 화상 스트림 (기존 경로)│
│        │                                                   │
│        └─→ MediaPipe Pose (JS)                             │
│             └→ 키포인트 33개 추출                           │
│             └→ 정규화 (어깨중점 원점 + 어깨너비 스케일)     │
│             └→ 피처 벡터 12~15개                            │
│                                                            │
│  * 판정 안 함. 추출·정규화만.                               │
└──────────────────────┬─────────────────────────────────────┘
                       │  WebSocket · 1Hz · 피처 벡터만 (~400B/s)
                       ↓
┌────────────── Spring Boot (Java) ─────────────────────────┐
│                                                            │
│  ① PostureDetector  ← 인터페이스 (A/B/C 교체 지점)         │
│     ├ RuleBasedDetector   방법 A  ← 구현 완료              │
│     ├ HybridDetector      방법 B  ← 구현 완료 (거북목만)   │
│     └ ImageDetector       방법 C  ← 나중 (ONNX 로드)       │
│           ↓                                                │
│  ② calibrations.baseline_data(JSON) 대조                   │
│           ↓  개인 체형 편차 제거                            │
│  ③ 2종 독립 severity 산출                                  │
│       거북목 / 어깨높낮이  (각 0~5, 턱 괴기는 브라우저 판정) │
│           ↓                                                │
│  ④ 30초 윈도우 판정기 (항목별 독립 + 히스테리시스 + 쿨다운) │
│           ↓  확정된 것만                                    │
│  ⑤ events INSERT  (detail로 3종 구분, metadata에 판정근거)  │
│     + WebSocket 알림 push → 브라우저                        │
│           ↓                                                │
│  ⑥ 세션 종료 시 events 집계 → 부위 점수·total_score         │
└──────────────────────┬─────────────────────────────────────┘
                       ↓
              MySQL  ·  events / calibrations / study_records



┌─── Python (개발자 PC, 오프라인. 서비스 아님) ────┐
│                                                   │
│  수집 데이터셋                                     │
│   ├ 피처 CSV     → sklearn (로지스틱) … 방법 B    │
│   └ 원본 프레임  → PyTorch (CNN)      … 방법 C    │
│              ↓                                    │
│   방법 B: 모델 JSON (계수 몇 줄)                  │
│   방법 C: model.onnx                              │
└──────────────┬────────────────────────────────────┘
               ↓
   방법 B: ai/models/*.json 을 backend resources/models/ 로 복사
   방법 C: Spring이 ONNX Runtime Java로 로드


### 방법 B — 하이브리드 판정기

`ai/train.ipynb`가 내보낸 로지스틱 회귀 계수를 그대로 읽어 판정한다.
ONNX Runtime은 쓰지 않는다. 로지스틱 회귀는 표준화 계수와 가중치가 전부라, 실행 엔진을
얹어도 하는 일은 곱셈 아홉 번과 같다. 신경망을 올리는 방법 C에서 들이면 된다.

**켜는 법** — `app.posture.detector=hybrid` (또는 `POSTURE_DETECTOR=hybrid`).
기본값은 `rule-based`다. 모델 파일 경로는 `app.posture.hybrid.*-model`에 지정한다.

**규칙 기반과의 역할 분담** — 하이브리드는 규칙 기반을 먼저 돌리고 **심각도만** 모델 확률로
갈아 끼운다.

| 항목 | 담당 |
|---|---|
| `severity` (0~5) | 모델 확률 → `severity-probabilities` 경계 |
| `deviation_degrees` | 규칙 기반의 기하 각도 (확률을 넣으면 단위가 깨져 A와 비교 불가) |
| 보류 판단 (가시성·회전·기준선) | 규칙 기반 (두 방식이 같은 프레임 집합에서 평가돼야 비교가 성립) |
| 모델이 없는 자세 | 규칙 기반 결과 그대로 |

지금은 거북목 모델만 있다. 어깨 높낮이는 `shoulder-tilt-model`에 경로를 채우는 순간부터
학습 판정으로 바뀐다. **코드 변경은 없다.** (라운드숄더는 판정 자체가 빠져 모델 슬롯도 없다 —
HybridPostureDetector 주석 참고. 턱 괴기는 브라우저가 판정해 보내므로 서버 모델 대상이 아니다.)

**피처** — 모델이 쓰는 9개는 v1 피처 벡터로 만들 수 없다(눈 좌표·깊이 z가 v1에 없고,
`ear_z_rel`·`acromion_proxy`는 가중치가 커서 뺄 수 없다). v1을 동결한 채 쓰려고
`PostureFeatures.mlFeatures`라는 **선택 블록**을 덧붙였다. 이 블록이 없는 요청은 예전처럼
규칙 기반으로 판정된다. 브라우저 추출 코드는 `posture-lab.html`의 `extractMlFeatures()`이며,
`ai/train.ipynb`의 `compute_features`와 한 글자도 다르면 안 된다.

**모델을 재학습하면** `ai/models/*.json`을 `backend/src/main/resources/models/`로 다시
복사한다. `HybridPostureDetectorTest`가 그 파일을 직접 읽어 파이썬 추론과 같은 확률이
나오는지 확인하므로, 계수가 바뀌면 테스트의 기대값도 함께 갱신해야 한다.



세 갈래 데이터 흐름 (헷갈리기 쉬운 부분)
흐름	경로	보관	목적
A. 화상	브라우저 → OpenVidu → 스토리지	7일 후 삭제	스터디룸 기능, 녹화
B. 자세 판정	브라우저 → WebSocket(피처) → Spring → MySQL	영구 (events)	실시간 판정·점수
C. 학습 데이터셋	별도 수집 세션	별도 동의 · 별도 보관	방법 B/C 학습, A/B/C 평가
# 디자인 시안 안내

웹훅 연동 확인을 위한 디자인 시안 영역입니다.
