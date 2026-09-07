# 운영 런북 — 각잡고(Protractor)

장애 대응·진단·반복적으로 물린 함정 모음. (서버: `ubuntu@i15c106.p.ssafy.io`, `docker`는 `sudo` 필요)

---

## 1. 증상별 대응

### 전체 502 (사이트 접속 불가)
nginx가 upstream(backend/frontend)에 못 붙는 것. 대부분 **backend가 못 뜸**.
```bash
sudo docker ps --format '{{.Names}} {{.Status}}' | grep -E 'backend|frontend|nginx'
sudo docker inspect protractor-backend-prod --format 'Status={{.State.Status}} Restarts={{.RestartCount}}'
sudo docker logs --tail 60 protractor-backend-prod 2>&1 | grep -iE 'Started|Caused by|APPLICATION FAILED|Access denied|WeakKey|Unknown column'
```
**크래시 원인 패턴(실제 겪음)**
| 로그 | 원인 | 조치 |
|---|---|---|
| `WeakKeyException ... 0 bits` | `JWT_SECRET` 비었거나 32B 미만 | secrets에 32B+ 값(`openssl rand -hex 32`) + **recreate** |
| `Access denied for user 'protractor_prod'` | DB_PASSWORD 불일치/오타 | secrets DB_PASSWORD = MySQL 유저 비번 일치 후 recreate |
| `모델의 mean/std/coef 길이가 feature_order와 다릅니다` | 자세추정 ML 모델(shoulder_tilt) 불량 | 백엔드/ML 정합 모델 재배포 |
| `Unknown column '...'` | 스키마 드리프트(엔티티↔테이블) | DB에 컬럼 반영(수동 ALTER) |
| Jenkins `No such container` + 502 | **유령 컨테이너**(중단된 --force-recreate) | `sudo docker rm -f <id>` 후 `up -d --no-deps backend frontend` |

**즉시 복구가 안 되면 롤백**: `prod-deploy` 잡을 이전 `VERSION`으로 재실행.

### 화상(OpenVidu)이 안 됨
```bash
sudo docker ps | grep openvidu
sudo docker exec protractor-nginx grep -n 'openvidu' /etc/nginx/conf.d/*.conf
```
체크: openvidu 컨테이너 Up / nginx `location = /openvidu` 존재 / 미디어 **UDP 8000–8199** 개방 / `KMS_EXTERNAL_ADDRESS`=공인IP / `FORCE_PLAIN_HTTP=false`. 그래도 안 되면 **클라이언트측**(마이크 권한, ICE) — 브라우저 `chrome://webrtc-internals`로 ICE 후보 확인.

### 소셜 로그인만 안 됨
`redirect_uri_mismatch`(구글) / `KOE006`(카카오) → 콘솔의 redirect URI가 백엔드 발급값과 **정확 일치**하는지. localhost로 빠지면 `*_REDIRECT_URI`/`OAUTH_FRONTEND_CALLBACK_URL` env 확인.
```bash
sudo docker logs --tail 40 protractor-backend-prod 2>&1 | grep -iE 'oauth|redirect|invalid'
```

### 비밀번호 찾기 메일 안 옴
mail은 **health에서 제외**돼 서버는 UP인데 조용히 실패. `MAIL_USERNAME/PASSWORD`(Gmail 앱 비번) 확인 + 실제 기능 테스트로만 검증.

---

## 2. 반복적으로 물린 함정 (중요)

1. **env 변경은 restart로 반영 안 됨** → 반드시 `docker compose ... up -d --force-recreate <svc>`. (JWT·DB비번·MAIL 반영 안 돼서 여러 번 헷갈림)
2. **DooD 상대경로**: Jenkins가 compose를 `/app-deploy`에서 돌리므로 `./x`가 `/app-deploy/x`로 해석됨. 볼륨은 `/srv/...` **절대경로**로.
3. **유령 컨테이너**: `--force-recreate`를 중간에 끊으면 이름 충돌 → 502 + Jenkins "No such container". `docker rm -f <id>` 후 재기동.
4. **서비스명 없이 `docker compose up -d`(전체)** 는 config 바뀐 서비스를 재생성 → 의도치 않은 재시작. **항상 서비스명 지정.**
5. **`.env` 통째 덮어쓰기 주의**: prod-deploy가 `.env`의 `PROD_*_IMAGE`를 갱신 → **DD_API_KEY 등 다른 키 보존** 로직 필수(sed로 해당 줄만 교체).
6. **git 태그는 별도 push**: `git push origin <tag>` (일반 push에 안 딸려감). Jenkins는 원격 태그를 당김.
7. **nginx 업스트림**: `resolver 127.0.0.11` + `set $var; proxy_pass http://$var` 로 런타임 재해석 → 컨테이너 재생성/IP 변경에도 502 안 남(정적 upstream이면 매번 깨짐).
8. **OpenVidu 401**: 프록시 뒤에서도 wss 토큰을 발급하려면 `FORCE_PLAIN_HTTP=false`. (ws 토큰이면 https 페이지에서 mixed-content + URL 불일치로 401)

---

## 3. 진단 명령 모음
```bash
# 컨테이너 상태·리소스
sudo docker ps --format 'table {{.Names}}\t{{.Status}}'
sudo docker stats --no-stream
df -h / ; free -h

# 앱 헬스 / 이미지 버전
sudo docker exec protractor-backend-prod sh -c 'wget -qO- http://localhost:8080/actuator/health'
sudo docker inspect protractor-backend-prod --format '{{.Config.Image}}'

# nginx 검증·리로드
sudo docker exec protractor-nginx nginx -t && sudo docker exec protractor-nginx nginx -s reload

# Datadog agent
sudo docker exec dd-agent agent status 2>&1 | grep -iE 'API Key|Logs Agent|Traces received'

# 백업 수동 실행
sudo /home/ubuntu/app/backup-prod.sh && ls -lh /srv/protractor/backups
```

## 4. 배포·롤백 요약
- **테스트**: develop push → 자동. **운영**: `prod-deploy` 잡 수동(파라미터 `VERSION=vX.Y.Z`).
- **릴리스**: develop→main 병합 → `git tag vX.Y.Z` + `git push origin vX.Y.Z` → prod-deploy.
- **롤백**: prod-deploy를 이전 버전으로 재실행(이미지 보관 5개).
- **핫픽스**: main 분기 → vX.Y.(Z+1) → prod-deploy → **develop back-merge 필수**.
