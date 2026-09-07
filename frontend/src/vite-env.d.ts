/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /**
   * 개발용 studyRecordId 폴백.
   * 입장(join) API 가 실패했을 때 이 세션 id 로 자세 판정을 계속 진행한다.
   * 미설정 시 1.
   */
  readonly VITE_DEV_SESSION_ID?: string;
  /**
   * Datadog RUM 애플리케이션 id / 클라이언트 토큰.
   * 둘 다 있어야 RUM 이 켜진다 (src/lib/datadog.ts).
   */
  readonly VITE_DD_RUM_APP_ID?: string;
  readonly VITE_DD_RUM_CLIENT_TOKEN?: string;
  /** Datadog 리전. 미설정 시 ap1.datadoghq.com. */
  readonly VITE_DD_SITE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
