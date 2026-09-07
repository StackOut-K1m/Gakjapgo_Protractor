import { createBrowserRouter } from 'react-router-dom';

// 음성 동의서 — 아래 consent 경로와 함께 감춰 둔다(2026-08-03)
// import VoiceConsentPage from '@/pages/VoiceConsentPage';
import ProtectedRoute from '@/components/ProtectedRoute';
import RootLayout from '@/components/layout/RootLayout';
import CalendarPage from '@/pages/CalendarPage';
import ComingSoonPage from '@/pages/ComingSoonPage';
import CommunityPage from '@/pages/CommunityPage';
import CreateStudyPage from '@/pages/CreateStudyPage';
import PostDetailPage from '@/pages/PostDetailPage';
import SupportPage from '@/pages/SupportPage';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import MyPage from '@/pages/MyPage';
import NotFoundPage from '@/pages/NotFoundPage';
import OAuthCallbackPage from '@/pages/OAuthCallbackPage';
import OnboardingPage from '@/pages/OnboardingPage';
import PasswordFindPage from '@/pages/PasswordFindPage';
import RoomPreparationPage from '@/pages/RoomPreparationPage';
import SignupPage from '@/pages/SignupPage';
import StudyCompletePage from '@/pages/StudyCompletePage';
import StudyDetailPage from '@/pages/StudyDetailPage';
import StudyListPage from '@/pages/StudyListPage';
import StudyRoomPage from '@/pages/StudyRoomPage';
import WeeklyReportPage from '@/pages/WeeklyReportPage';

export const router = createBrowserRouter([
  // 헤더가 있는 일반 화면
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'signup', element: <SignupPage /> },
      { path: 'password/find', element: <PasswordFindPage /> },
      { path: 'oauth/callback', element: <OAuthCallbackPage /> },
      // 스터디 방 찾기·상세. 백엔드가 목록·상세 GET을 공개(permitAll)해 비로그인도 볼 수 있다.
      { path: 'study', element: <StudyListPage /> },
      { path: 'study/create', element: <CreateStudyPage /> },
      { path: 'study/:roomId', element: <StudyDetailPage /> },

      // 커뮤니티. 하위 경로는 같은 게시판 화면을 해당 탭이 열린 상태로 보여준다.
      // 게시판 탭은 CommunityPage 가 주소에서 읽는다. 그래서 element 가 모두 같고,
      // 탭을 바꿀 때 화면이 다시 마운트되지 않아 정렬·검색어가 유지된다.
      { path: 'community', element: <CommunityPage /> },
      { path: 'community/free', element: <CommunityPage /> },
      { path: 'community/questions', element: <CommunityPage /> },
      { path: 'community/resources', element: <CommunityPage /> },
      { path: 'community/notice', element: <CommunityPage /> },
      { path: 'community/events', element: <CommunityPage /> },
      // 게시글 상세는 커뮤니티·이벤트·문의가 함께 쓴다. 문의 글 접근 제한은 서버가 검사한다.
      { path: 'community/posts/:postId', element: <PostDetailPage /> },

      // 문의하기 (1:1 문의는 아래 보호 라우트에 있다)
      { path: 'support/faq', element: <ComingSoonPage title="FAQ" /> },

      // 로그인 필요한 보호 라우트
      {
        element: <ProtectedRoute />,
        children: [
          // 회원가입 직후 자동 진입한다. 온보딩 API가 전부 인증을 요구해서 보호 라우트에 둔다.
          { path: 'onboarding', element: <OnboardingPage /> },
          // 1:1 문의는 "내 문의" 목록이라 로그인 없이는 의미가 없다.
          { path: 'support', element: <SupportPage /> },
          { path: 'mypage', element: <MyPage /> },
          { path: 'mypage/report/weekly', element: <WeeklyReportPage /> },
          { path: 'mypage/calendar', element: <CalendarPage /> },
        ],
      },
    ],
  },

  // 별도 팝업 창으로 여는 화면 (헤더 없음)
  {
    element: <ProtectedRoute />,
    errorElement: <NotFoundPage />,
    children: [
      {
        path: 'study/room/:roomId/preparation',
        element: <RoomPreparationPage />,
      },
      { path: 'study/room/:roomId', element: <StudyRoomPage /> },
      // 음성 동의서 — 음성 녹음 기능을 감추면서 경로도 막아 둔다(2026-08-03).
      // 페이지 파일(VoiceConsentPage.tsx)은 그대로 남겨 두었다.
      // { path: 'study/room/:roomId/consent', element: <VoiceConsentPage /> },
      // 방을 나가면 이 화면으로 이동한다. 세션 요약은 라우터 state 로 넘어온다.
      { path: 'study/room/complete', element: <StudyCompletePage /> },
    ],
  },
]);
