# 1단계: Gradle 이미지에서 Spring Boot jar 파일을 빌드한다.
FROM gradle:8.10.2-jdk21 AS build
WORKDIR /app

# Gradle wrapper와 빌드 설정을 먼저 복사한다.
# Docker는 명령 단위로 cache를 쓰기 때문에, 의존성/빌드 설정 변경 여부를 추적하기 좋다.
COPY gradlew gradlew
COPY gradle gradle
COPY build.gradle settings.gradle ./

# 실제 애플리케이션 소스 코드다.
COPY src src

# Spring Boot 실행 가능한 jar 파일을 만든다.
# Windows 체크아웃(CRLF)에서도 gradlew 셔뱅이 깨지지 않도록 줄바꿈(\r)을 먼저 정규화한다.
RUN sed -i 's/\r$//' gradlew && chmod +x ./gradlew && ./gradlew clean bootJar --no-daemon

# 2단계: 실제 실행에는 JRE만 있는 이미지를 사용한다.
#
# alpine 이 아니라 데비안 계열을 쓰는 이유는 한글 폰트다. 주간 리포트는 차트(JFreeChart)와
# PDF(openhtmltopdf)에 TTF 를 직접 실어야 하는데, 두 곳 모두 TrueType 단일 파일을 기대한다.
# alpine 의 한글 폰트 패키지는 font-noto-cjk 뿐이고 이는 .ttc(폰트 컬렉션)만 제공해서
# Font.createFont(TRUETYPE_FONT, ...) 와 PDFBox 폰트 적재가 실패한다.
# 데비안 fonts-nanum 은 NanumGothic.ttf 를 그대로 준다.
FROM eclipse-temurin:21-jre
WORKDIR /app

# 한글 폰트. 없으면 차트 한글이 □ 로 깨지고 PDF 렌더가 예외로 죽어 리포트가 FAILED 로만 남는다.
#
# dd-java-agent 는 Datadog APM 트레이서다. 빌드 의존성이 아니라 런타임에 JVM 이 붙이는
# javaagent 라서 build.gradle 이 아니라 여기서 받는다. curl 은 그 용도로만 쓰고 바로 지운다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-nanum curl \
 && curl -Lo /app/dd-java-agent.jar https://dtdg.co/latest-java-tracer \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# 폰트 경로를 이미지 안에서 못박아 둔다. 배포 환경변수를 빠뜨려도 리포트가 동작해야 한다
# (application.yml 기본값은 로컬 Windows 의 맑은 고딕이라 컨테이너에는 존재하지 않는다).
ENV REPORT_FONT_PATH=/usr/share/fonts/truetype/nanum/NanumGothic.ttf \
    REPORT_FONT_BOLD_PATH=/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf

# 컨테이너를 root 권한으로 실행하지 않기 위한 전용 사용자다.
RUN groupadd -r app && useradd -r -g app app

# 업로드·리포트가 파일을 쓰는 자리. 이미지 안에 app 소유로 미리 만들어 둬야 한다.
#
# 여기에 named volume 을 붙이면(docker-compose 의 backend-data), 도커는 볼륨이 비어 있을 때
# 이미지 쪽 디렉터리의 내용과 소유권을 그대로 복사해 간다. 이 줄이 없으면 그 자리가 이미지에
# 없어서 도커가 root 소유로 새로 만들고, uid 999 로 도는 앱은 하위 폴더조차 못 만든다
# (프로필 사진 업로드가 500 으로 떨어졌던 원인이다).
RUN mkdir -p /app/data && chown -R app:app /app/data

# build 단계에서 만든 jar만 가져온다. Gradle cache나 소스 파일은 최종 이미지에 들어가지 않는다.
COPY --from=build --chown=app:app /app/build/libs/*.jar app.jar

# 이 아래 명령부터 app 사용자 권한으로 실행된다.
USER app

# Spring Boot 기본 HTTP 포트다.
EXPOSE 8080

# 컨테이너 메모리 제한에 맞춰 JVM이 메모리를 과하게 쓰지 않도록 설정한다.
#
# -javaagent 로 Datadog 트레이서를 붙인다. DD_AGENT_HOST 가 주어지지 않으면 트레이서는
# localhost:8126 으로 보내다 실패하고 조용히 포기하므로, 에이전트가 없는 로컬/CI 에서도
# 앱은 그대로 뜬다. (수집을 켜려면 compose 에서 DD_* 환경변수를 넣는다)
ENV JAVA_OPTS="-javaagent:/app/dd-java-agent.jar -XX:MaxRAMPercentage=75.0 -XX:InitialRAMPercentage=50.0 -Djava.security.egd=file:/dev/./urandom"

# 컨테이너 시작 시 jar를 실행한다.
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
