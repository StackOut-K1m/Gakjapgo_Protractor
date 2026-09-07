// src/hooks/useDocumentPip.ts
import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * requestWindow 옵션 중 이 화면이 쓰는 것만 추린 타입.
 * lib.dom.d.ts 에 아직 Document Picture-in-Picture 가 없어서 직접 선언한다.
 */
interface RequestWindowOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

interface DocumentPictureInPicture {
  requestWindow(options?: RequestWindowOptions): Promise<Window>;
  /** 지금 열려 있는 PiP 창. 없으면 null */
  readonly window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

/**
 * - `ok`: 열렸다(이미 열려 있던 경우 포함)
 * - `unsupported`: 브라우저에 API 자체가 없다
 * - `blocked`: API 는 있는데 브라우저가 거부했다 (사용자 제스처 없이 부른 경우가 대부분)
 */
export type PipOpenResult = 'ok' | 'unsupported' | 'blocked';

/**
 * 현재 문서의 스타일을 PiP 창으로 복사한다.
 *
 * <p>
 * PiP 창은 빈 문서로 열린다 — 스타일시트가 하나도 없어서 그대로 두면 CSS Module 클래스가
 * 전부 무효가 되고 서식 없는 텍스트만 남는다. 개발 서버는 스타일을 <style> 로 주입하고
 * 빌드 결과는 <link> 로 거는데, 둘 다 같은 출처라 cssRules 를 읽어 그대로 옮길 수 있다.
 *
 * <p>
 * 읽지 못하는 시트(다른 출처)는 규칙 접근에서 예외가 나므로 <link> 로 다시 건다.
 */
function copyStyles(target: Window) {
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      const css = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      const style = target.document.createElement('style');
      style.textContent = css;
      target.document.head.appendChild(style);
    } catch {
      if (!sheet.href) return;
      const link = target.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      target.document.head.appendChild(link);
    }
  });
}

/**
 * Document Picture-in-Picture 창을 여닫는다.
 *
 * <p>
 * 영상만 띄우는 `HTMLVideoElement.requestPictureInPicture()` 와 다르다. 이쪽은 빈 창을
 * 하나 열어 주고 그 안에 원하는 DOM 을 넣을 수 있어서, 카메라 영상 옆에 경고 문구와
 * 버튼을 같이 둘 수 있다. 스터디룸 PiP 는 경고 종류를 글로 보여줘야 해서 이 API 가 필요하다.
 *
 * <p>
 * <b>여는 데는 사용자 제스처가 필요하다.</b> 클릭 핸들러 안에서 부르지 않으면 브라우저가
 * 거부한다('blocked'). 닫는 것은 제스처 없이도 된다.
 *
 * <p>
 * Chrome/Edge 116+ 에서만 동작한다. 스터디룸은 이미 별도 팝업 창으로 뜨고 MediaPipe·ONNX 를
 * 쓰는 크로미움 전제 화면이라 같은 범위다.
 */
export function useDocumentPip() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const supported =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  const close = useCallback(() => {
    // state 만 비우면 창은 그대로 남는다. 실제 창을 닫아야 한다.
    // 내가 연 창은 documentPictureInPicture.window 로 다시 찾을 수 있다.
    window.documentPictureInPicture?.window?.close();
    setPipWindow(null);
  }, []);

  const open = useCallback(
    async (options?: RequestWindowOptions): Promise<PipOpenResult> => {
      const api = window.documentPictureInPicture;
      if (!api) return 'unsupported';

      // 이미 열려 있으면 다시 요청하지 않는다 — 요청하면 창이 새로 뜬다.
      if (api.window) {
        setPipWindow(api.window);
        return 'ok';
      }

      let pip: Window;
      try {
        pip = await api.requestWindow(options);
      } catch (e) {
        console.warn('[pip] 창을 열지 못했습니다', e);
        return 'blocked';
      }

      pip.document.title = '각잡GO';
      copyStyles(pip);
      // 사용자가 PiP 창의 닫기 버튼을 누른 경우. 문서가 아직 살아 있을 때 불리므로
      // 여기서 state 를 비우면 리액트가 포털을 안전하게 걷어낼 수 있다.
      pip.addEventListener('pagehide', () => setPipWindow(null), {
        once: true,
      });
      setPipWindow(pip);
      return 'ok';
    },
    [],
  );

  // 이 화면을 벗어나면(룸 나가기·새로고침) PiP 창만 덩그러니 남지 않게 정리한다.
  useEffect(
    () => () => {
      window.documentPictureInPicture?.window?.close();
    },
    [],
  );

  // 창이 바뀔 때만 새 객체가 되게 한다. 매 렌더 새 객체를 주면 이 값을 의존성으로 쓰는
  // 효과(스트레칭 강제 해제 등)가 렌더마다 다시 돈다.
  return useMemo(
    () => ({ supported, pipWindow, open, close }),
    [supported, pipWindow, open, close],
  );
}
