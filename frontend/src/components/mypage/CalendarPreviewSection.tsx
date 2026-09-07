import { Link } from 'react-router-dom';

import { getSchedules } from '@/api/scheduleApi';
import SectionCard from '@/components/mypage/SectionCard';
import { useAsync } from '@/hooks/useAsync';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatScheduleDate(targetDate: string) {
  const d = new Date(targetDate);
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  return `${mm}/${dd}(${WEEKDAYS[d.getDay()]})`;
}

function CalendarPreviewSection() {
  const now = new Date();
  const { data, loading, error } = useAsync(
    () => getSchedules(now.getFullYear(), now.getMonth() + 1),
    [],
  );

  return (
    <SectionCard
      title="📅 나의 학습 캘린더"
      // 여기서는 목록만 보여준다. 등록·수정은 캘린더 화면에서 한다.
      // link-button 은 링크를 버튼처럼 보이게 하려고 둔 공용 클래스다 — 맨 <a> 로 두면
      // 밑줄 글씨라 눌러야 할 것으로 안 보인다.
      actions={
        <Link to="/mypage/calendar" className="link-button primary">
          전체 보기
        </Link>
      }
    >
      {loading && <p className="muted">불러오는 중…</p>}
      {error && <p className="error">{error}</p>}
      {data && data.length === 0 && <p className="muted">예정된 일정이 없습니다.</p>}
      {data && data.length > 0 && (
        <ul className="schedule-list">
          {data.map((s) => (
            <li key={s.scheduleId} className="schedule-item">
              <span
                className="schedule-dot"
                style={{ background: s.color ?? 'var(--gak-primary)' }}
                aria-hidden
              />
              <span className="schedule-date">{formatScheduleDate(s.targetDate)}</span>
              {s.memo && <span className="schedule-time">{s.memo}</span>}
              <span className="schedule-title">{s.title}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export default CalendarPreviewSection;
