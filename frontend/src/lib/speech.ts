// src/lib/speech.ts
//
// 브라우저 내장 음성 합성(Web Speech API)으로 짧은 안내를 읽어 준다.
//
// 서버로 나가는 것이 없다 — 문장을 만들어 브라우저에 넘기면 끝이다. 자세·졸음 판정과 같은
// 이유로 이 방식을 골랐다: 학습 중 화면이 무엇을 감지했는지가 외부로 나가지 않는다.
//
// 목소리는 사용자의 OS·브라우저에 설치된 것을 쓴다. 한국어 목소리가 없는 기기도 있는데,
// 그때는 기본 목소리가 한국어를 어색하게 읽는다. 읽기를 포기하는 것보다는 낫다고 보고
// 그대로 둔다(lang 만 ko-KR 로 지정한다).

/**
 * 읽는 속도(1이 기본).
 *
 * 안내가 짧고 이미 화면에도 같은 내용이 떠 있어서, 기본 속도로 읽으면 다 듣기 전에
 * 무슨 말인지 알아채고 기다리게 된다. 1.6 을 넘기면 조사가 뭉개져 알아듣기 어려워지므로
 * 그 아래에서 잡았다.
 */
const SPEECH_RATE = 1.25;

/** 목소리 목록은 비동기로 채워진다. 매번 찾지 않도록 한 번 고르면 들고 있는다. */
let cachedVoice: SpeechSynthesisVoice | null = null;

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * 한국어 목소리 하나를 고른다. 없으면 null(브라우저 기본값을 쓴다).
 *
 * <p>
 * getVoices() 는 처음 부를 때 빈 배열을 주는 경우가 많다 — 목록이 아직 안 왔기 때문이다.
 * 그래서 값을 찾을 때까지 매번 다시 고른다. 캐시는 찾은 뒤에만 채운다.
 */
function pickKoreanVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  const voices = window.speechSynthesis.getVoices();
  const korean = voices.find(
    (v) => v.lang === 'ko-KR' || v.lang.startsWith('ko'),
  );
  if (korean) cachedVoice = korean;
  return korean ?? null;
}

/** cancel() 과 speak() 사이에 두는 간격(ms). 아래 speak 주석 참고. */
const CANCEL_SETTLE_MS = 80;

interface SpeakOptions {
  /**
   * 읽는 중이어도 끊고 말한다. 스트레칭 시작·완료처럼 놓치면 안 되는 안내에만 쓴다.
   * 기본값(false)은 읽는 중이면 이번 문장을 버린다.
   */
  interrupt?: boolean;
}

/**
 * 한 문장을 읽는다. 실제로 읽기 시작했으면 true.
 *
 * <p>
 * <b>읽는 중이면 새 문장을 버리는 것이 기본이다.</b> 처음에는 반대로 — 늘 끊고 새로 읽게 —
 * 만들었는데, 그게 "들렸다 안 들렸다" 의 원인이었다. 경고는 몰려서 온다(자세가 무너지면
 * 졸음·휴대폰도 같이 잡힌다). 매번 끊으면 두 가지가 겹친다:
 *
 * <ol>
 *   <li>앞 문장이 중간에 잘려 무슨 말인지 못 알아듣는다</li>
 *   <li>크로미움에는 cancel() 직후의 speak() 를 함께 삼키는 문제가 있어, 끊은 문장도
 *       새 문장도 둘 다 안 나오는 경우가 생긴다</li>
 * </ol>
 *
 * 자세 경고는 20초마다 다시 읽으므로 한 번 버려도 곧 다음 기회가 온다. 끊어야만 하는
 * 안내는 interrupt 로 따로 지정한다.
 *
 * @returns 읽기를 시작했으면 true, 버렸으면 false
 */
export function speak(text: string, options: SpeakOptions = {}): boolean {
  if (!isSpeechSupported()) return false;
  const synth = window.speechSynthesis;

  // 크로미움은 말하는 도중 창이 가려지거나 포커스를 잃으면 합성기를 멈춤 상태로 두는 일이
  // 있다. 그 상태에서 speak() 를 부르면 큐에 쌓이기만 하고 소리가 나지 않는다.
  if (synth.paused) synth.resume();

  const busy = synth.speaking || synth.pending;
  if (busy && !options.interrupt) {
    if (import.meta.env.DEV)
      console.info(`[음성] 읽는 중이라 건너뜀 — ${text}`);
    return false;
  }
  if (busy) synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  const voice = pickKoreanVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = SPEECH_RATE;

  if (import.meta.env.DEV) {
    utterance.addEventListener('start', () => console.info(`[음성] ▶ ${text}`));
    utterance.addEventListener('end', () => console.info('[음성] ■ 끝'));
    utterance.addEventListener('error', (e) =>
      console.warn(`[음성] ⛔ 재생 실패 (${e.error}) — ${text}`),
    );
  }

  const start = () => {
    synth.speak(utterance);
    // speak() 직후에도 멈춤 상태로 남는 경우가 있다. 한 번 더 깨운다.
    if (synth.paused) synth.resume();
  };

  // 끊은 직후에 바로 speak() 를 부르면 크로미움이 둘 다 삼킨다. 잠깐 뒤로 미룬다.
  if (busy) setTimeout(start, CANCEL_SETTLE_MS);
  else start();

  return true;
}

/** 읽던 것을 즉시 멈춘다. 기능을 끄거나 화면을 벗어날 때 부른다. */
export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}
