import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { withdrawMembership } from '@/api/mypageApi';
import SectionCard from '@/components/mypage/SectionCard';
import { useAuthStore } from '@/stores/useAuthStore';

function WithdrawalSection() {
  const navigate = useNavigate();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleWithdraw = async () => {
    if (!password) {
      setError('비밀번호를 입력해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await withdrawMembership(password);
      clearAuth();
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : '탈퇴에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionCard title="회원 탈퇴">
      <p className="muted small">
        탈퇴 시 계정이 비활성화되고 개인정보는 보존 정책에 따라 파기됩니다. 이 작업은 되돌릴 수 없습니다.
      </p>

      {!open ? (
        <div className="section-actions">
          <button type="button" className="danger" onClick={() => setOpen(true)}>
            회원 탈퇴
          </button>
        </div>
      ) : (
        <div className="withdraw-confirm">
          <label>
            비밀번호 확인
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="현재 비밀번호"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="section-actions">
            <button type="button" className="danger" disabled={submitting} onClick={handleWithdraw}>
              {submitting ? '처리 중…' : '탈퇴하기'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setOpen(false);
                setPassword('');
                setError('');
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export default WithdrawalSection;
