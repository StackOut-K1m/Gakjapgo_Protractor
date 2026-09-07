# Jenkins (CI/CD) 구성

서버 Jenkins의 **이미지 정의 + 잡 설정**을 캡처한 것. Jenkins는 **DooD**(호스트 docker.sock 마운트)로 호스트 도커를 조종해 빌드·배포한다.

## 파일
| 경로 | 설명 |
|---|---|
| `Dockerfile` | Jenkins LTS + docker CLI + docker compose 플러그인 설치(DooD용) |
| `jobs/app-pipeline/config.xml` | **테스트(develop)** 자동배포 잡. GitLab push 웹훅 트리거, `docker build :latest` → `backend`/`frontend` 재생성 |
| `jobs/prod-deploy/config.xml` | **운영(main)** 수동배포 잡. 파라미터 `VERSION`, `refs/tags/${VERSION}` 체크아웃, 버전 이미지 빌드(프론트 RUM build-arg 주입), 오버레이 병합, 이미지 5개 보관 |

> `config.xml` = **웹 UI에서 구성한 잡(빌드 Execute shell·파라미터·Git·트리거)이 그대로 저장된 파일.** 즉 브라우저에서 넣었던 빌드 스크립트가 `<command>` 안에 들어 있다.

## compose 연동 (본 레포 `infra/docker-compose.yml`)
```yaml
jenkins:
  build: ./jenkins
  volumes:
    - ./jenkins_home:/var/jenkins_home
    - /var/run/docker.sock:/var/run/docker.sock   # DooD
    - /home/ubuntu/app:/app-deploy                 # compose·secrets 읽기
  group_add: ["988"]                               # 호스트 docker 그룹 gid
  ports: ["9090:8080"]
```

## 재현 절차
1. `docker compose up -d jenkins` (위 Dockerfile로 빌드됨).
2. **잡 생성**: Jenkins UI에서 New Item으로 `app-pipeline`·`prod-deploy` 생성 후, 여기 `config.xml`을 `jenkins_home/jobs/<잡>/config.xml`에 넣고 **Reload Configuration from Disk**. (또는 UI에서 config.xml 내용 그대로 재입력)
3. ⚠️ **크레덴셜 재생성 필요**: config.xml의 `<credentialsId>gitlab-https</credentialsId>` 는 **참조(ID)일 뿐**, 실제 GitLab 토큰은 jenkins_home에 **암호화 저장**되어 인스턴스에 종속(이식 불가). → Jenkins UI Credentials에서 **`gitlab-https` ID로 GitLab 토큰을 다시 등록**해야 한다.
4. **플러그인**: `gitlab-plugin`(웹훅 트리거용) 등 필요 플러그인 설치.
5. **웹훅**: GitLab 프로젝트 → Webhooks 에서 develop push → Jenkins app-pipeline 트리거 등록(운영 prod-deploy는 웹훅 없이 수동).

## 참고 — 담긴 값
- Git URL: `https://lab.ssafy.com/s15-webmobile2-sub1/S15P11C106.git` (비밀 아님)
- RUM App ID / Client Token: prod-deploy 빌드 스크립트에 있음(**브라우저 노출용 공개 토큰**, 비밀 아님)
- **실제 시크릿 없음** (DB·JWT·OAuth 등은 compose env_file 로 주입, Jenkins에 없음)
