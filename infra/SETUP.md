# 호스트 초기 셋업 절차 — 각잡고(Protractor)

새 호스트에서 서비스를 처음 세우는 순서. (파일 재현은 `infra/*`, 상세 값은 `../exec/`)

## 0. 전제
- Docker + Docker Compose 설치. 사용자를 docker 그룹에 넣거나 `sudo docker` 사용.
- 호스트 **공인 IP** 확보(WebRTC ICE·인증서용). 예: `3.35.18.185`.
- **⚠️ AWS Lightsail 계열이면** 인스턴스 역할로 S3 접근 불가 → S3는 **IAM 유저 키** 필요.

## 1. 네트워크 · 디렉터리
```bash
docker network create protractor-net        # 최초 1회 (compose가 external로 참조)

# 업로드 영속 디렉터리 (backend 컨테이너 실행 uid=999 소유여야 씀)
sudo mkdir -p /srv/protractor/uploads/{posts,profile-images}
sudo mkdir -p /srv/protractor/prod/uploads/{posts,profile-images}
sudo mkdir -p /srv/protractor/backups
sudo chown -R 999:999 /srv/protractor/uploads /srv/protractor/prod/uploads
```

## 2. 구성 파일 배치 (이 레포 `infra/` → 호스트 `~/app/`)
```
~/app/
├─ docker-compose.yml            (infra/docker-compose.yml, 도메인/IP 교체)
├─ docker-compose.datadog.yml
├─ nginx/conf.d/{default,gakjapgo}.conf   (server_name·인증서 경로 교체)
├─ openvidu/{kms.sh, BaseRtpEndpoint.conf.ini}
├─ jenkins/Dockerfile
├─ schema.sql                    (빈 파일 or 스키마; 실제 스키마는 DB 덤프로)
├─ .env                          (.env.example 채우기)
├─ backend-secrets.env           (chmod 600)
└─ backend-secrets-prod.env      (chmod 600)
```
```bash
chmod 600 ~/app/backend-secrets*.env
```

## 3. 도메인/IP 교체 지점
- `docker-compose.yml`: `DOMAIN_OR_PUBLIC_IP`, `KMS_EXTERNAL_ADDRESS`, `CORS_ALLOWED_ORIGINS`, `OPENVIDU_PUBLIC_WS_URL`, OAuth redirect(backend-prod).
- `nginx/conf.d/*.conf`: `server_name`, `ssl_certificate` 경로.

## 4. TLS 인증서 (certbot)
- 운영 도메인용 발급(예 `gakjapgo.site`). **standalone**은 80 포트 필요 → nginx 잠깐 중지:
```bash
sudo docker stop protractor-nginx
sudo docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot \
  certonly --standalone -d <도메인> -d www.<도메인> --email <메일> --agree-tos --no-eff-email -n
sudo docker start protractor-nginx
```
- ⚠️ **자동갱신 없음** → 만료(90일) 전 갱신. 개선: webroot+cron 또는 `--nginx`.

## 5. 포트 정책 (방화벽/보안그룹 + compose 바인딩)
| 포트 | 용도 | 노출 |
|---|---|---|
| 80/443 | nginx (HTTP/HTTPS) | 외부 개방 |
| 4443 + **8000–8199/udp** | OpenVidu 시그널링 + 미디어(SRTP) | 외부 개방(미디어 UDP 필수) |
| 3306 | MySQL | **127.0.0.1 바인딩**(외부 차단, SSH 터널) |
| 9090 | Jenkins | (웹훅용 노출 — 보안상 제한 권장) |

## 6. docker 그룹 gid (Jenkins DooD)
```bash
getent group docker      # 예: docker:x:988:  → compose jenkins의 group_add 값과 일치시킬 것
```

## 7. 기동
```bash
cd ~/app
docker compose up -d nginx mysql redis openvidu jenkins
# DB 스키마/시드 import
docker exec -i protractor-mysql sh -c 'mysql -uroot -p<root_pw> protractor_prod' < protractor_prod_dump.sql
# 앱
docker compose up -d backend frontend                                            # 테스트
docker compose -f docker-compose.yml -f docker-compose.datadog.yml up -d backend-prod frontend-prod  # 운영
```

## 8. 백업 cron (root)
```bash
sudo cp infra/scripts/backup-prod.sh /home/ubuntu/app/backup-prod.sh
sudo chmod 700 /home/ubuntu/app/backup-prod.sh     # ROOT_PW 채우고
sudo bash -c '(crontab -l 2>/dev/null; echo "0 4 * * * /home/ubuntu/app/backup-prod.sh >> /var/log/protractor-backup.log 2>&1") | crontab -'
```

## 9. Jenkins 잡 (상세 `jenkins/README.md`)
- 컨테이너 기동 후 UI에서 `app-pipeline`·`prod-deploy` 생성 + `config.xml` 반영.
- **크레덴셜 `gitlab-https` 재등록**(GitLab 토큰), `gitlab-plugin` 설치, GitLab 웹훅(develop).
