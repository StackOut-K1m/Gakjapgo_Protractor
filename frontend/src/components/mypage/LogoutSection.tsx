import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { logout } from '@/api/authApi';
import SectionCard from '@/components/mypage/SectionCard';
import { useAuthStore } from '@/stores/useAuthStore';

function LogoutSection() {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const nickname = useAuthStore((s) => s.member?.nickname ?? null);
  const [submitting, setSubmitting] = useState(false);

  const handleLogout = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await logout(); // 서버의 refreshToken 무효화
    } catch {
      // 서버 로그아웃이 실패해도 클라이언트 세션은 반드시 정리한다.
    } finally {
      setSubmitting(false);
    }
    clearAuth();
    navigate('/', { replace: true });
  };

  return (
    <SectionCard title="로그아웃">
      <p className="muted small">
        {nickname ? `${nickname} 님으로 로그인되어 있습니다. ` : ''}
        이 기기에서 로그아웃합니다. 계정과 학습 기록은 그대로 유지됩니다.
      </p>

      <div className="section-actions">
        <button type="button" onClick={handleLogout} disabled={submitting}>
          로그아웃
        </button>
      </div>
    </SectionCard>
  );
}

export default LogoutSection;
