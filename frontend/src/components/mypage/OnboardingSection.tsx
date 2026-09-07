import { useNavigate } from 'react-router-dom';

import { getMyOnboarding } from '@/api/onboardingApi';
import SectionCard from '@/components/mypage/SectionCard';
import { useAsync } from '@/hooks/useAsync';

/** 'YYYY.MM.DD' 표기. 값이 없거나 못 읽으면 null. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${mm}.${dd}`;
}

/**
 * 온보딩 다시 하기.
 *
 * <p>
 * 온보딩은 회원가입 직후 한 번만 지나가는 화면이라, 그때 고른 학습 목적·목표 시간·관심
 * 태그를 나중에 바꿀 길이 없었다. 화면 자체는 이미 다시 해도 되게 만들어져 있다 —
 * 이미 끝낸 사람이 저장하면 서버가 409 로 막고, 그러면 수정(PATCH)으로 이어 간다
 * (OnboardingPage 참고). 들어갈 문만 없었다.
 *
 * <p>
 * 감지 동의만 바꾸려면 아래 '감지 동의' 카드가 더 빠르다. 여기는 목적·목표·태그까지
 * 처음부터 다시 고르는 자리다.
 */
function OnboardingSection() {
  const navigate = useNavigate();
  const { data, loading } = useAsync(() => getMyOnboarding(), []);

  /*
   * '마지막 설정'은 완료 시각이 아니라 마지막 수정 시각이다.
   *
   * 온보딩을 다시 해도 서버는 완료 시각(onboardingCompletedAt)을 건드리지 않는다 —
   * 그건 처음 끝낸 때를 가리키는 값이라 그래야 맞다. 그쪽을 보여 주고 있어서, 다시 하고
   * 돌아와도 날짜가 그대로라 저장이 안 된 것처럼 보였다.
   */
  const lastSetAt = formatDate(data?.updatedAt ?? null);
  const hasOnboarded = Boolean(data?.onboardingCompletedAt);

  return (
    <SectionCard
      title={
        <span className="section-title-with-help">
          온보딩 정보
          {/* 설명을 본문에 깔면 카드가 길어지는데, 정작 처음 한 번만 읽는 문장이다.
              필요할 때만 꺼내 보도록 아이콘 뒤에 둔다.
              button 인 이유는 키보드로도 열려야 해서다 — div 는 포커스를 못 받는다. */}
          <button
            type="button"
            className="help-dot"
            aria-label="온보딩 정보 설명"
          >
            i
            <span className="help-bubble" role="tooltip">
              학습 목적과 목표 시간, 관심 태그를 다시 고를 수 있어요. 지금
              설정은 그대로 불러와 둡니다.
            </span>
          </button>
        </span>
      }
    >
      <p className="muted">
        {loading
          ? '마지막 설정 시점을 불러오는 중…'
          : hasOnboarded
            ? `마지막 설정: ${lastSetAt ?? '-'}`
            : '아직 온보딩을 완료하지 않았어요.'}
      </p>

      <button
        type="button"
        className="primary"
        // 마치면 홈이 아니라 여기로 돌아온다(OnboardingPage 의 returnTo)
        onClick={() => navigate('/onboarding', { state: { from: '/mypage' } })}
      >
        온보딩 다시 하기
      </button>
    </SectionCard>
  );
}

export default OnboardingSection;
