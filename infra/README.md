# infra — 각잡고(Protractor) 인프라 구성 (재현용)

서버 `~/app` 의 실제 인프라 구성 파일을 **시크릿 정제**해 옮긴 것. 이 폴더 + 시크릿 실제 값 + 배포 절차로 서비스를 재현할 수 있다.

## 구성 파일
| 파일 | 설명 |
|---|---|
| `docker-compose.yml` | 인프라(nginx·jenkins·mysql·redis·openvidu) + 앱(backend/frontend, backend-prod/frontend-prod). 시크릿은 `${VAR}`/`env_file` 로 외부화 |
| `docker-compose.datadog.yml` | Datadog 오버레이(agent + backend-prod APM env). 운영 배포 시 `-f` 로 병합 |
| `nginx/conf.d/default.conf` | 테스트 도메인(i15c106) vhost — `/api`·`/ws`·`/openvidu` 라우팅, TLS 종단 |
| `nginx/conf.d/gakjapgo.conf` | 운영 도메인(gakjapgo.site) vhost — backend-prod/frontend-prod 라우팅 |
| `openvidu/kms.sh` | KMS 기동 스크립트(공인 IP를 ICE `externalIPv4` 로 광고) |
| `openvidu/BaseRtpEndpoint.conf.ini` | 미디어 UDP 포트 범위(8000–8199) |
| `.env.example` | compose 가 읽는 변수(시크릿·이미지태그·DD) 템플릿 |
| `backend-secrets.env.example` / `backend-secrets-prod.env.example` | 앱 시크릿(env_file) 템플릿 — 키만, 값 없음 |
| `jenkins/` | Jenkins 이미지(Dockerfile) + 잡 설정(app-pipeline·prod-deploy config.xml). 상세 `jenkins/README.md` |
| `scripts/backup-prod.sh` | 운영 DB+업로드 백업(root cron용, 비번 정제됨). cron: `0 4 * * * .../backup-prod.sh` |
| `SETUP.md` | 새 호스트 초기 셋업 절차(네트워크·dir·인증서·포트·cron·Jenkins) |
| `RUNBOOK.md` | 운영 런북 — 장애 대응(502 패턴)·함정·진단 명령 |
| `ARCHITECTURE.md` | 아키텍처(요청/데이터 흐름, 정정본) |

## ⚠️ 이 폴더에 **없는 것** (별도 필요)
- **실제 시크릿 값**: `.env`, `backend-secrets*.env`, `scripts/backup-prod.sh`의 `ROOT_PW` 는 각자 채워야 함(커밋 금지). 값은 개인 관리처(운영자) 참조.
- **Jenkins 크레덴셜/플러그인**: 잡 설정(config.xml)은 포함되나, GitLab 토큰 크레덴셜(`gitlab-https`)은 암호화·이식 불가라 **재등록 필요**. `jenkins/README.md` 참조.
- **DB 스키마/데이터**: `exec/protractor_prod_dump.sql`(정제 시드) 참조. `schema.sql` 은 빈 파일.
- **TLS 인증서**: 호스트 `/etc/letsencrypt`(certbot 발급). compose 가 ro 마운트만.

## 재현 절차 (요약)
```bash
# 1) 사전
docker network create protractor-net
sudo mkdir -p /srv/protractor/uploads/{posts,profile-images} /srv/protractor/prod/uploads/{posts,profile-images}
sudo chown -R 999:999 /srv/protractor

# 2) 시크릿 채우기
cp .env.example .env                                   # 값 채우기
cp backend-secrets.env.example backend-secrets.env      # 값 채우기, chmod 600
cp backend-secrets-prod.env.example backend-secrets-prod.env
chmod 600 backend-secrets*.env

# 3) 도메인/공인IP 교체
#   docker-compose.yml: DOMAIN_OR_PUBLIC_IP, KMS_EXTERNAL_ADDRESS, CORS/WS URL
#   nginx/conf.d/*.conf: server_name, ssl_certificate 경로
#   → 배포 환경 도메인/인증서로 수정

# 4) TLS 인증서 발급 (certbot) 후

# 5) 인프라 + 앱 기동
docker compose up -d nginx mysql redis openvidu
docker compose up -d backend frontend                  # 테스트
# 운영(모니터링 포함):
docker compose -f docker-compose.yml -f docker-compose.datadog.yml up -d backend-prod frontend-prod

# 6) DB 스키마/시드 import
docker exec -i protractor-mysql sh -c 'mysql -uroot -p<root_pw> protractor_prod' < ../exec/protractor_prod_dump.sql
```
> 앱 이미지(`protractor-backend`/`frontend`)는 각 레포 `Dockerfile` 로 빌드하거나 Jenkins 파이프라인으로 생성. 상세 환경변수·외부서비스는 `../exec/` 참조.

## 보안
- `.env`, `backend-secrets*.env`, `mysql_data/`, `jenkins_home/` 등은 **`.gitignore` 필수**. 이 폴더엔 `*.example` 만 커밋.
