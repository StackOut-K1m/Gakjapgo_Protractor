import CalendarPreviewSection from '@/components/mypage/CalendarPreviewSection';
import ConsentSection from '@/components/mypage/ConsentSection';
import NotificationSection from '@/components/mypage/NotificationSection';
import OnboardingSection from '@/components/mypage/OnboardingSection';
import PasswordChangeSection from '@/components/mypage/PasswordChangeSection';
import ProfileSection from '@/components/mypage/ProfileSection';
import RecentStudySection from '@/components/mypage/RecentStudySection';
import StudyGoalsSection from '@/components/mypage/StudyGoalsSection';
import TotalStatsSection from '@/components/mypage/TotalStatsSection';
import WithdrawalSection from '@/components/mypage/WithdrawalSection';
import PageHeader from '@/components/layout/PageHeader';
import './MyPage.css';

function MyPage() {
  return (
    <div className="mypage">
      <PageHeader
        title="마이페이지"
        description="나의 학습 현황과 스터디 참여 내역을 관리합니다."
      />

      <div className="mypage-grid">
        <div className="mypage-main">
          <ProfileSection />
          <TotalStatsSection />
          <CalendarPreviewSection />
          <StudyGoalsSection />
          {/*
            리포트 요약 카드는 없앴다 — 같은 내용이 주간 리포트 페이지에도 있어서 한쪽만
            고치는 일이 생겼다(열람 마감 계산이 실제로 그렇게 어긋나 있었다).
            그 화면으로 들어오는 길은 상단 내비게이션에 있다.
          */}
          <RecentStudySection />
        </div>

        <aside className="mypage-side">
          {/* 온보딩·감지 동의를 나란히 둔다. 둘 다 온보딩에서 정한 값이라,
              "그때 고른 걸 바꾸고 싶다"는 사람이 한자리에서 찾는다. */}
          <OnboardingSection />
          <ConsentSection />
          <NotificationSection />
          <PasswordChangeSection />
          <WithdrawalSection />
        </aside>
      </div>
    </div>
  );
}

export default MyPage;
