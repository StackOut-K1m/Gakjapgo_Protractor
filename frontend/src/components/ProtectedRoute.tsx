import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useIsLoggedIn } from '@/stores/useAuthStore';

/**
 * 인증이 필요한 라우트를 감싸는 문지기 컴포넌트.
 *
 * - 로그인됨   → 자식 페이지(<Outlet/>)를 그대로 보여줌
 * - 미로그인   → /login 으로 리다이렉트하면서, 원래 가려던 위치를 state에 기록
 *               (로그인 성공 후 그 위치로 되돌려보내기 위함)
 */
function ProtectedRoute() {
  const isLoggedIn = useIsLoggedIn();
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;
