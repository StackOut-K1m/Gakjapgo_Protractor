#!/bin/bash
# 운영 DB + 업로드 백업 (호스트 root cron 용)
# 원본 위치: 서버 ~/app/backup-prod.sh (chmod 700, root 소유)
# cron 등록:  0 4 * * * /home/ubuntu/app/backup-prod.sh >> /var/log/protractor-backup.log 2>&1
#
# ⚠️ MySQL root 비번을 아래에 채우거나(권장: --defaults-extra-file 로 분리),
#    이 파일은 chmod 700 로 잠글 것.
set -e
BK=/srv/protractor/backups
DATE=$(date +%F)
ROOT_PW="<MYSQL_ROOT_PASSWORD>"     # ← 실제 값으로 교체

mkdir -p "$BK"

# 운영 DB 덤프
docker exec protractor-mysql sh -c "mysqldump -uroot -p'$ROOT_PW' --databases protractor_prod" \
  | gzip > "$BK/prod_db_$DATE.sql.gz"

# 운영 업로드 파일
tar czf "$BK/prod_uploads_$DATE.tgz" -C /srv/protractor/prod uploads

# 14일 초과분 정리
find "$BK" -name 'prod_db_*.sql.gz'   -mtime +14 -delete
find "$BK" -name 'prod_uploads_*.tgz' -mtime +14 -delete
