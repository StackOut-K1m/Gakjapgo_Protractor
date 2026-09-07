import { useMemo, useState } from 'react';

import { getApiErrorMessage } from '@/api/client';
import { getMyOnboarding, updateMyOnboarding } from '@/api/onboardingApi';
import SectionCard from '@/components/mypage/SectionCard';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { useAsync } from '@/hooks/useAsync';
import type { ConsentKey } from '@/types/onboarding';

type Consents = Record<ConsentKey, boolean>;

/**
 * required 는 서비스 이용의 전제라 켠 뒤에는 끌 수 없는 항목(서버도 철회를 400으로 거절).
 * 다만 정책 도입 전에 미동의로 남은 계정이 있어, 꺼진 것을 켜는 방향은 열어 둔다.
 */
const ITEMS: { key: ConsentKey; label: string; desc: string; required?: boolean }[] = [
  {
    key: 'postureDetectionConsent',
    label: '자세 감지',
    desc: '거북목·턱 괴기·어깨 높낮이를 감지해 알려드려요 (필수 동의)',
    required: true,
  },
  {
    key: 'drowsinessDetectionConsent',
    label: '졸음 감지',
    desc: '눈이 감긴 상태가 이어지면 알려드려요 (필수 동의)',
    required: true,
  },
  {
    key: 'postureCaptureConsent',
    label: '학습 장면 저장',
    desc: '10초에 한 번씩 화면을 담아 종료 화면에서 타임랩스로 보여드려요 (창을 닫으면 지워져요)',
  },
];

/**
 * AI 감지 동의 설정.
 *
 * 온보딩에서 한 번 고르는 값인데, 이미 온보딩을 끝낸 사용자는 그 화면으로 다시 갈 수 없다.
 * 여기가 없으면 나중에 추가된 항목(학습 장면 저장)을 기존 회원은 영영 켤 수 없다.
 */
function ConsentSection() {
  const { data, loading, error } = useAsync(getMyOnboarding, []);
  /** 사용자가 바꾼 값. 아직 안 건드렸으면 null 이고 서버가 준 값을 그대로 쓴다. */
  const [edited, setEdited] = useState<Consents | null>(null);
  const [savingKey, setSavingKey] = useState<ConsentKey | null>(null);
  const [msg, setMsg] = useState('');

  // 서버 응답을 state 로 복사하지 않는다. 효과 안에서 setState 하면 렌더가 한 번 더 돈다.
  const consents = useMemo<Consents | null>(() => {
    if (edited) return edited;
    if (!data) return null;
    return {
      postureDetectionConsent: data.postureDetectionConsent,
      drowsinessDetectionConsent: data.drowsinessDetectionConsent,
      postureCaptureConsent: data.postureCaptureConsent,
    };
  }, [edited, data]);

  const toggle = async (key: ConsentKey) => {
    if (!consents) return;
    const previous = consents;
    setEdited({ ...consents, [key]: !consents[key] }); // 낙관적 업데이트
    setSavingKey(key);
    setMsg('');
    try {
      // 부분 수정 API 라 바뀐 항목만 보낸다.
      await updateMyOnboarding({ [key]: !previous[key] });
      setMsg('저장되었습니다.');
    } catch (e) {
      setEdited(previous); // 실패 시 롤백
      setMsg(getApiErrorMessage(e, '저장에 실패했습니다.'));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <SectionCard
      title={
        // 온보딩 정보 카드와 같은 방식이다. 안내를 본문에 깔면 토글 세 줄이 밀려 내려가
        // 정작 조작할 것이 안 보인다. 처음 한 번만 읽는 문장이라 아이콘 뒤에 둔다.
        <span className="section-title-with-help">
          AI 감지 동의
          <button type="button" className="help-dot" aria-label="AI 감지 동의 설명">
            i
            <span className="help-bubble" role="tooltip">
              · 영상은 서버로 보내지 않고 브라우저 안에서만 분석해요.
              <br />· 자세 감지: 거북목·턱 괴기·어깨 높낮이를 알려드려요.
              <br />· 졸음 감지: 눈이 감긴 상태가 이어지면 알려드려요.
              <br />· 학습 장면 저장: 껐다 켰다 할 수 있어요.
            </span>
          </button>
        </span>
      }
    >
      {loading && <p className="muted">불러오는 중…</p>}
      {error && <p className="error">{error}</p>}
      {consents && (
        <ul className="toggle-list">
          {ITEMS.map((item) => (
            <li key={item.key}>
              <ToggleSwitch
                layout="row"
                label={item.label}
                description={item.desc}
                checked={consents[item.key]}
                disabled={
                  savingKey !== null ||
                  (item.required === true && consents[item.key])
                }
                onChange={() => toggle(item.key)}
              />
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="saved-msg">{msg}</p>}
    </SectionCard>
  );
}

export default ConsentSection;
