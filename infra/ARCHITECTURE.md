# 아키텍처 — 각잡고(Protractor)

웹캠 기반 온라인 스터디룸. 요청/데이터 흐름 중심 설명. (기존 `아키텍처_설명서.docx`의 오류 정정본)

## 인프라 개요
- **AWS Lightsail** 단일 호스트(공인 IP `3.35.18.185`)에서 Docker Compose로 인프라+앱을 구동.
- 엣지 **nginx**가 443 TLS를 종단하고 내부 서비스로 프록시. 전 컨테이너는 `protractor-net`.
- **운영/테스트 2환경 병행**: 운영 `gakjapgo.site`(backend-prod/frontend-prod, DB `protractor_prod`, Redis idx 1) / 테스트 `i15c106.p.ssafy.io`(backend/frontend, DB `protractor`, idx 0). nginx·mysql·redis·openvidu·jenkins는 **공유**.

## 요청/데이터 흐름

### 1. 일반 프론트 페이지
브라우저 `https://도메인`(443) → **nginx**(리버스프록시) → **frontend 컨테이너(80)** → React SPA 반환.

### 2. 백엔드 API
SPA가 `/api/...` 호출 → nginx → **backend(8080)** tcp → 비즈니스 로직.

### 3. 실시간 방 생성
방 생성 요청 → backend → 결과를 클라이언트에 직접 안 주고 **OpenVidu-Server(4443)** 에 세션 생성 요청 → 세션 생성 + **접속 토큰** 발급 → 클라이언트에 반환.

### 4. 실시간 세션 제어(시그널링)
- 세션 제어는 **WebSocket RPC**. 브라우저 `wss://도메인/openvidu` → nginx **TLS 종단** → 내부 `ws://openvidu:4443` → OpenVidu-Server가 **코덱·미디어 UDP 포트를 협상** → 다시 nginx 거쳐 wss로 클라이언트에 전파.
- ⚠️ 프록시 뒤에서도 OpenVidu가 **wss 토큰을 발급**하도록 `FORCE_PLAIN_HTTP=false` 필수(아니면 ws 토큰 → 401).

### 5. 실시간 상태 데이터(채팅·참여자·타이머)
- 브라우저 `wss://도메인/ws`(STOMP) → nginx **TLS 종단(wss→ws)** → **backend(8080)** → 처리 후 다시 wss로 클라이언트에 전달.
- (nginx는 TLS를 **복호화/전달**할 뿐, 메시지를 "검증"하지 않음. 인증은 backend/STOMP 계층.)

### 6. 실시간 미디어(영상·음성·화면공유) — SFU
- 미디어는 **nginx·backend를 거치지 않고**, 브라우저와 **Kurento Media Server(KMS)** 사이 **UDP/SRTP**로 직접 흐름(포트 8000–8199).
- 구조는 **SFU(별형)**: 각 브라우저는 KMS에 **1번만 업로드**하고, **KMS가 다른 참가자들에게 재전송(relay)**. 즉 **KMS가 미디어 중계 서버**다. (원시 WebRTC의 Mesh(그물)와 달리 중심 노드가 있음)
- KMS는 NAT 뒤라 `KMS_EXTERNAL_ADDRESS`(공인 IP)를 ICE 후보로 광고(`externalIPv4`).

### 7. OpenVidu 컨테이너 내부
- 한 컨테이너에 두 서버: **OpenVidu-Server**(nginx 거쳐 4443, 메타데이터·지시 관리) + **KMS**(호스트로부터 UDP 직접 연결, 미디어 송수신). 둘 사이는 ws(Kurento JSON-RPC).

### 8. DB
- 영속 데이터: `protractor-mysql:3306`(MySQL). 캐시·세션·refresh token: `protractor-redis:6379`(Redis, 논리 DB 인덱스 분리).

## 전송(transport) 선택 원리
| 데이터 | 전송 | 이유 |
|---|---|---|
| 채팅·타이머·상태 | **WebSocket(TCP)** | 신뢰·순서 보장 필요, 경량 이벤트 |
| 세션 제어(시그널링) | **WebSocket RPC** | 제어 평면 |
| 영상·음성·화면공유 | **WebRTC(UDP/SRTP)** | 저지연·연속성 중요, 손실 허용(TCP의 head-of-line 회피) |

→ **제어/상태 평면(WebSocket, 경량)** 과 **미디어 평면(WebRTC/UDP, 대용량)** 을 분리한 것이 확장성의 핵심.

## 관측성
- Datadog: 인프라 지표·로그(agent), 백엔드 **APM**(dd-java-agent → `datadog-agent:8126`), 프론트 **RUM**(빌드 시 번들 주입).

## (구 docx 대비) 정정 사항
- "미디어가 **중계 서버를 거치지 않고**" → **KMS가 곧 SFU 중계 서버**. 정확히는 "**nginx를 거치지 않고 KMS와 직접 UDP**".
- nginx가 "이를 **검증**하고" → nginx는 **TLS 종단(복호화)·프록시**만. 검증은 backend.
- "**EC2**" → **Lightsail**.
- 오타: "Openvide" → OpenVidu, "STRP" → **SRTP**.
