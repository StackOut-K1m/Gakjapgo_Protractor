import { datadogRum } from '@datadog/browser-rum';

/**
 * Datadog RUM(Real User Monitoring) 초기화.
 *
 * 키가 없으면 아무것도 하지 않는다. 로컬 개발과 CI 빌드에는 키를 넣지 않으므로
 * 그 환경에서는 SDK 가 네트워크를 전혀 쓰지 않고 조용히 비활성 상태로 남는다.
 *
 * 여기서 쓰는 값은 빌드 시점에 번들로 박히는 공개 토큰이다(브라우저가 그대로 들고 있다).
 * 쓰기 전용이라 유출돼도 데이터를 읽히지는 않지만, 서버용 DD_API_KEY 와는 완전히 다른 값이니
 * 절대 그쪽을 넣지 않는다.
 */
export function initDatadogRum(): void {
  const applicationId = import.meta.env.VITE_DD_RUM_APP_ID;
  const clientToken = import.meta.env.VITE_DD_RUM_CLIENT_TOKEN;

  if (!applicationId || !clientToken) return;

  datadogRum.init({
    applicationId,
    clientToken,
    // 가입한 Datadog 리전과 반드시 같아야 한다. 다르면 데이터가 조용히 버려진다.
    site: import.meta.env.VITE_DD_SITE ?? 'ap1.datadoghq.com',
    service: 'protractor-frontend',
    env: import.meta.env.MODE,
    sessionSampleRate: 100,
    // 세션 리플레이는 용량 과금이 따로 붙는다. 재현 안 되는 버그를 볼 만큼만 남긴다.
    sessionReplaySampleRate: 20,
    trackUserInteractions: true,
    trackResources: true,
    // MediaPipe/onnxruntime 추론 루프가 메인 스레드를 얼마나 잡는지 보려면 필요하다.
    trackLongTasks: true,
    // 입력값(비밀번호·이메일 등)은 리플레이에 남기지 않는다.
    defaultPrivacyLevel: 'mask-user-input',
    // 프론트 세션과 백엔드 트레이스를 한 줄로 잇는다. nginx 가 /api 를 백엔드로 프록시해서
    // 동일 오리진이므로 CORS 프리플라이트 없이 x-datadog-* 헤더가 그대로 넘어간다.
    allowedTracingUrls: [(url: string) => url.startsWith(window.location.origin + '/api')],
  });
}
