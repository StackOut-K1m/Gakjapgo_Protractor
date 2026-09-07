import { getMyStudyRooms } from '@/api/mypageApi';
import SectionCard from '@/components/mypage/SectionCard';
import { useAsync } from '@/hooks/useAsync';

/**
 * 30초를 기준으로 반올림한다(18분 29초 → 18분, 18분 30초 → 19분).
 * 시를 먼저 떼고 남은 초만 반올림하면 59분 40초가 '60분'으로 찍히므로,
 * 전체를 분으로 반올림한 뒤에 시·분으로 나눈다.
 */
function formatDuration(seconds: number) {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}

function RecentStudySection() {
  const { data, loading, error } = useAsync(() => getMyStudyRooms(0, 5), []);

  return (
    <SectionCard title="최근 스터디">
      {loading && <p className="muted">불러오는 중…</p>}
      {error && <p className="error">{error}</p>}
      {data && data.studyRooms.length === 0 && (
        <p className="muted">참여한 스터디가 아직 없습니다.</p>
      )}
      {data && data.studyRooms.length > 0 && (
        <ul className="study-list">
          {data.studyRooms.map((room) => (
            <li key={room.roomId} className="study-item">
              <div className="study-main">
                <span className="study-title">{room.title}</span>
                {room.category && (
                  <span className="badge">{room.category}</span>
                )}
              </div>
              <div className="study-meta">
                <span>{room.joinedAt.slice(0, 10)}</span>
                <span>· {formatDuration(room.totalStudySeconds)}</span>
                {typeof room.totalScore === 'number' && (
                  <span className="study-score">· {room.totalScore}점</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export default RecentStudySection;
