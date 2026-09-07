import { useEffect, useState } from 'react';

import {
  getNotificationSettings,
  updateNotificationSettings,
} from '@/api/mypageApi';
import { getApiErrorMessage } from '@/api/client';
import SectionCard from '@/components/mypage/SectionCard';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { useAsync } from '@/hooks/useAsync';
import type { NotificationSettings } from '@/types/mypage';

const ITEMS: {
  key: keyof NotificationSettings;
  label: string;
  desc: string;
}[] = [
  { key: 'friendEnabled', label: '친구 알림', desc: '친구 요청·수락 알림 받기' },
  { key: 'dmEnabled', label: '쪽지 알림', desc: '새 쪽지 도착 알림 받기' },
  {
    key: 'communityEnabled',
    label: '커뮤니티 알림',
    desc: '내 글의 댓글·답글 알림 받기',
  },
  { key: 'inquiryEnabled', label: '문의 알림', desc: '문의 답변 알림 받기' },
  { key: 'noticeEnabled', label: '공지 알림', desc: '서비스 공지 알림 받기' },
  {
    key: 'reportEnabled',
    label: '리포트 알림',
    // 리포트 카드에 있던 토글을 여기로 합쳤다. 어떤 알림인지 문구로 분명히 한다.
    desc: '매주 월요일 주간 리포트 알림 받기',
  },
  { key: 'rankingEnabled', label: '랭킹 알림', desc: '랭킹 변동 알림 받기' },
];

function NotificationSection() {
  const { data, loading, error } = useAsync(getNotificationSettings, []);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [savingKey, setSavingKey] = useState<keyof NotificationSettings | null>(
    null,
  );
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (data) setSettings(data);
  }, [data]);

  const toggle = async (key: keyof NotificationSettings) => {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next); // 낙관적 업데이트
    setSavingKey(key);
    setMsg('');
    try {
      // 부분 수정 API 라 바뀐 항목만 보낸다.
      const saved = await updateNotificationSettings({ [key]: next[key] });
      setSettings(saved); // 서버가 돌려준 최종 상태로 맞춤
      setMsg('저장되었습니다.');
    } catch (e) {
      setSettings(settings); // 실패 시 롤백
      setMsg(getApiErrorMessage(e, '저장에 실패했습니다.'));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <SectionCard title="알림 설정">
      {loading && <p className="muted">불러오는 중…</p>}
      {error && <p className="error">{error}</p>}
      {settings && (
        <ul className="toggle-list">
          {ITEMS.map((item) => (
            <li key={item.key}>
              <ToggleSwitch
                layout="row"
                label={item.label}
                description={item.desc}
                checked={settings[item.key]}
                disabled={savingKey !== null}
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

export default NotificationSection;