import { useState } from 'react';

import { changePassword } from '@/api/authApi';
import SectionCard from '@/components/mypage/SectionCard';

function PasswordChangeSection() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setNewPasswordConfirm('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      setError('모든 항목을 입력해주세요.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError('새 비밀번호가 일치하지 않습니다.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMsg('');
    try {
      const res = await changePassword({ currentPassword, newPassword, newPasswordConfirm });
      setMsg(res.message);
      reset();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionCard title="비밀번호 변경">
      {!open ? (
        <div className="section-actions">
          <button type="button" onClick={() => setOpen(true)}>
            비밀번호 변경
          </button>
          {msg && <p className="saved-msg">{msg}</p>}
        </div>
      ) : (
        <div className="password-form">
          <label>
            현재 비밀번호
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label>
            새 비밀번호
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label>
            새 비밀번호 확인
            <input
              type="password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="section-actions">
            <button type="button" className="primary" disabled={submitting} onClick={handleSubmit}>
              {submitting ? '변경 중…' : '변경'}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setOpen(false);
                reset();
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

export default PasswordChangeSection;
