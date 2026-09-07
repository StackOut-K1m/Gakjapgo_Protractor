import { getMypageSummary } from '@/api/mypageApi';
import SectionCard from '@/components/mypage/SectionCard';
import { useAsync } from '@/hooks/useAsync';

/**
 * 누적 학습 시간 표기.
 *
 * 30초를 기준으로 반올림한다(18분 29초 → 18분, 18분 30초 → 19분).
 * 시를 먼저 떼고 남은 초만 반올림하면 59분 40초가 '0시간 60분'으로 찍힌다.
 * 그래서 전체를 분으로 반올림한 뒤에 시·분으로 나눈다.
 */
function formatHours(seconds: number) {
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}시간 ${m}분`;
}

/** 온보딩에서 설정한 목표. 아직 안 정했으면 '미설정'으로 둔다. */
function formatGoal(minutes: number | null) {
  if (minutes === null || minutes <= 0) return '미설정';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

function TotalStatsSection() {
  const { data, loading, error } = useAsync(getMypageSummary, []);

  return (
    <SectionCard title="전체 현황">
      {loading && <p className="muted">불러오는 중…</p>}
      {error && <p className="error">{error}</p>}
      {data && (
        // 박스는 세 개로 맞춘다. summary-grid 가 3열이라 그보다 많으면 다음 줄에
        // 한두 개만 남아 어정쩡하게 깨진다.
        <div className="summary-grid">
          {/*
            서버 필드 이름은 attendanceRate 지만 계산식은 출석률이 아니다.
            순공부 시간 ÷ (총 학습 시간 − 휴식 시간) — 쉬는 시간을 빼고 실제 집중한 비율이다.
            "출석률"로 적으면 '스터디에 몇 번 나왔는지'로 읽혀서 라벨만 실제 계산에 맞춘다.
            방마다 정해진 일정 개념이 없어 진짜 출석률은 아직 낼 수 없다
            (계산 근거는 MyPageService.attendanceRate 주석 참고).
          */}
          <SummaryBox
            label="학습 집중률"
            // 학습 기록이 없으면 서버가 null 을 준다. 그대로 쓰면 "null%" 가 찍힌다.
            value={
              data.attendanceRate === null ? '-' : `${data.attendanceRate}%`
            }
          />
          <SummaryBox
            label="총 학습 시간"
            value={formatHours(data.totalStudyTime)}
          />
          {/* 주간 목표는 아래 '주간 목표' 카드에서 요일별로 자세히 보여준다 */}
          <SummaryBox label="하루 목표" value={formatGoal(data.goalMinutes)} />
        </div>
      )}
      {/* 처음 보면 "집중률이 뭐지?" 싶은 지표라 계산식을 한 줄로 달아둔다 (리포트 화면 지표 설명과 같은 문구) */}
      {data && (
        <p className="muted small">
          학습 집중률 = 순공부 ÷ (순공부 + 자리비움) × 100 — 방이 정한 휴식은
          빼고 계산해요.
        </p>
      )}
    </SectionCard>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-box">
      <span className="summary-label">{label}</span>
      <strong className="summary-value">{value}</strong>
    </div>
  );
}

export default TotalStatsSection;
