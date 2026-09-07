package com.protractor.backend.domain.report.service;

import com.protractor.backend.domain.report.dto.WeeklyMetrics;
import java.util.List;

/**
 * LLM 소견 프롬프트. 수치·표·그래프는 전부 코드가 데이터로 만들고, LLM은 해석 문장만 담당한다(환각 방지).
 * 프롬프트를 고치면 PROMPT_VERSION을 올린다(리포트 행에 함께 저장됨).
 *
 * <p>
 * 절 제목 구조는 두 곳과 맞물려 있다 — 바꿀 때 함께 볼 것.
 * <ul>
 * <li>PDF: {@link ReportOpinion}이 "## 0" 절의 "### 그래프 N" 제목으로 판독문을 각 그래프 아래에 배치</li>
 * <li>FE: frontend/src/utils/aiFeedback.ts가 "##" 제목 키워드(요약/잘한/아쉬운/다음 주)로 섹션 분류</li>
 * </ul>
 */
public final class ReportPrompt {

    /*
     * 프롬프트 안에 "10초"가 박혀 있다 — app.posture.window-seconds 를 바꾸면 여기도 같이
     * 바꿔야 한다. 설정을 주입하지 않는 이유는 이 클래스가 빈이 아니라 정적 템플릿이라서다.
     * 어긋나면 모델이 틀린 기준으로 설명을 쓴다(수치는 코드가 주므로 숫자 자체는 안 틀린다).
     */

    /**
     * v7: 실소견 검수(첫 기록 주·감지 0회 시나리오)에서 잡힌 결함 보완.
     * ① 전주 기록이 없으면 이벤트 횟수도 "기록 없음"으로 — 숫자 0으로 주면 모델이 "전주와 동일하게
     * 0회"라는 없는 비교를 썼다. ② 같은 사실 중복 평가 금지, 평가 강도를 수치에 비례, 스트레칭 0/0
     * 단정 금지, 기계 말투 금지, 희박 데이터 주는 짧게 등 문체 지침 추가. ③ 주 단위가 아닌 기간은
     * "이번 기간"으로 부르게 하고 달성률을 아예 주지 않는다(3일 기간을 주간 목표와 비교하던 문제).
     *
     * <p>
     * v6: 임상 소견서 페르소나 폐기·코치 톤 전환, LLM 표 생성 금지, 목표·4주 추세·DB 스트레칭 제공.
     * v5 이전: v4 나쁜 자세 종류별 분해, v5 집중 방해 절 — 전부 v6에 흡수.
     */
    public static final String PROMPT_VERSION = "v7";

    public static final String SYSTEM_PROMPT = """
            당신은 학습 관리 서비스 '각잡고'의 학습·자세 코치입니다. 학습자의 일주일 데이터를 읽고,
            다음 주에 바로 실천할 수 있는 짧고 구체적인 코칭 리포트를 씁니다.

            말투와 원칙:
            - 친근하고 담백한 존댓말. 과장하거나 훈계하지 않습니다. "~가 기록되었습니다",
              "~가 확인되었습니다" 같은 기계적인 말투 대신 사람이 말하듯 씁니다.
            - 의학·해부학 용어를 쓰지 않습니다(경추·승모근·임상 같은 말 대신 목·어깨·기록 같은 일상어).
              질병 진단도 하지 않습니다. 몸에 관한 말은 "~에 부담이 갈 수 있어요" 수준까지만.
            - 모든 판단에는 제공된 수치를 근거로 붙입니다. 제공되지 않은 수치를 만들지 않습니다.
            - '기록 없음'으로 표시된 값은 0이 아니라 데이터가 없는 것입니다. 그 값과 비교하거나
              "전주와 동일하다"고 쓰지 마세요. 전주가 기록 없음이면 이번이 첫 기록이라는 점을
              환영하는 톤으로 짧게 언급하면 충분합니다.
            - 같은 사실을 두 절에서 반복 평가하지 않습니다. 예: "하루만 공부했다"를 잘한 점에서
              집중력으로 칭찬했다면 아쉬운 점에서 또 꺼내지 말고, 다른 근거를 쓰세요.
            - 평가 강도를 수치에 비례시킵니다. 85점 이상이나 90%대 유지율을 문제 삼지 말고,
              2시간 안팎 공부를 "장시간"이라 부르지 마세요.
            - 스트레칭 "수행 0/0회"는 스트레칭 알림이 뜰 만큼 긴 세션이 없었다는 뜻일 수 있습니다.
              사용자가 안 한 것으로 단정하지 말고, 권할 때는 방법만 안내하세요.
            - 데이터가 적은 기간(학습 1~2일)은 억지로 절을 채우지 않습니다 — 요약 2~3문장,
              목록은 1~2개면 충분합니다. 짧고 정확한 것이 길고 뻔한 것보다 낫습니다.
            - 기간이 월~일 한 주가 아니면 "이번 주" 대신 "이번 기간"이라고 부릅니다.
            - 표를 그리지 않습니다(수치 표는 리포트가 따로 그려 넣습니다). 문장과 목록만 씁니다.
            - 아래 형식의 마크다운으로만 출력합니다. 절 제목(##, ###)은 그대로 씁니다 — 프로그램이
              이 제목으로 문단을 찾아 배치하므로 번호나 문구를 바꾸면 배치가 어긋납니다.

            출력 형식:
            ## 0. 그래프 판독
            ### 그래프 1: 일별 학습 시간 · 자세 유지율
            (2~3문장. 막대=일별 공부 시간, 주황 점=자세 유지율 — 기록이 이어진 날끼리만 선으로
             연결되고, 기록이 없는 날은 점 자체가 없다. "선이 끊겼다"고 쓰지 말 것.
             요일별 편차와 학습량·자세의 동반 관계를 짚으세요.)
            ### 그래프 2: 최근 4주 흐름
            (2~3문장. 막대=주별 순공부 시간, 주황 점=주별 자세 유지율(이어진 주끼리만 선 연결).
             4주 흐름이 오르는지 내리는지, 이번 주가 그 흐름의 어디에 있는지 짚으세요.
             기록 없는 주는 막대와 점이 없다.)
            ### 그래프 3: 부위별 자세 점수
            (2~3문장. 회색=전주, 색상=이번 주. 가장 낮은 부위와 가장 크게 변한 부위를 짚으세요.)
            ### 그래프 4: 집중을 깬 순간들
            (2~3문장. 회색=전주, 빨강=이번 주. 어떤 종류가 늘고 줄었는지, 그 의미를 짚으세요.)

            ## 1. 이번 주 요약
            (3~4문장: 순공부 시간과 목표 달성 → 자세 전반 → 가장 눈에 띄는 변화 하나.)

            ## 2. 잘한 점
            - (2~3개. 각 항목에 수치 근거를 붙일 것. 잘한 점이 마땅치 않으면 기록을 남긴 것 자체를
               구체적으로 칭찬하되 1개만.)

            ## 3. 아쉬운 점
            - (2~3개. 각 항목에 수치 근거를 붙일 것. 비난하지 말고 "언제·어떤 상황에서 그랬을지"
               데이터로 원인을 추정할 것. 졸음·휴대폰이 관찰됐다면 여기서 다룰 것.)

            ## 4. 다음 주 실천 3가지
            - (정확히 3개. 스트레칭을 권할 때는 아래 '추천 스트레칭' 목록에 있는 동작만 이름·빈도·시간과
               함께 쓸 것. 졸음이나 휴대폰이 관찰됐다면 하나는 그것을 겨냥할 것. 목표 시간이 설정돼
               있다면 하나는 목표 달성과 연결할 것.)""";

    private ReportPrompt() {
    }

    /** null이면 "기록 없음" — LLM이 0과 혼동하지 않게 문자열로 구분한다. */
    private static String score(Integer value) {
        return value == null ? "기록 없음" : String.valueOf(value);
    }

    private static String percent(Integer value) {
        return value == null ? "기록 없음" : value + "%";
    }

    private static String hours(long seconds) {
        return "%.1f시간".formatted(seconds / 3600.0);
    }

    /**
     * 초 → "1시간 40분". 학습 시간 블록은 소수 시간("0.2시간") 대신 이 표기를 쓴다 — 값마다 따로
     * 반올림한 소수는 합이 안 맞아 보여서(1.7+0.2+0.2=2.1 vs 총 2.0) 모델이 그대로 옮겨 적으면 이상하다.
     * 전체를 분으로 반올림한 뒤 시·분으로 나눈다(59분 40초가 "0시간 60분"이 되는 것 방지).
     */
    private static String hoursMinutes(long seconds) {
        long totalMinutes = Math.round(seconds / 60.0);
        long h = totalMinutes / 60;
        long minute = totalMinutes % 60;
        if (h == 0) {
            return minute + "분";
        }
        return minute == 0 ? h + "시간" : h + "시간 " + minute + "분";
    }

    /**
     * 이번 주/전주 횟수 줄. 전주에 세션 자체가 없으면 숫자 0 대신 "기록 없음"을 준다 — 0으로 주면
     * 모델이 "전주와 동일하게 0회"라는 없는 비교를 쓴다(첫 기록 주 실소견에서 실제로 나온 문장).
     */
    private static String counts(long cur, long prev, boolean prevMissing) {
        return prevMissing ? cur + "회 / 전주 기록 없음" : cur + " / " + prev + "회";
    }

    /**
     * 휴대폰 사용 줄. 횟수만으로는 "10초 확인"과 "20분 시청"이 같아 보이므로 총 시간을 함께 준다.
     *
     * <p>
     * 1분 미만은 분으로 반올림하면 0분이 되어 "썼는데 0분"이라는 이상한 값이 나온다. 그 구간만
     * 초로 적는다.
     */
    private static String phoneLine(WeeklyMetrics m, boolean prevMissing) {
        if (prevMissing) {
            return "%d회 (총 %s) / 전주 기록 없음".formatted(
                    m.eventCounts().phoneUse(), duration(m.eventCounts().phoneUseSeconds()));
        }
        return "%d / %d회 (총 %s / %s)".formatted(
                m.eventCounts().phoneUse(), m.prevEventCounts().phoneUse(),
                duration(m.eventCounts().phoneUseSeconds()), duration(m.prevEventCounts().phoneUseSeconds()));
    }

    private static String duration(long seconds) {
        if (seconds <= 0) {
            return "0분";
        }
        return seconds < 60 ? seconds + "초" : Math.round(seconds / 60.0) + "분";
    }

    /** 목표 줄. 목표가 없으면 없는 대로 알려 LLM이 목표 얘기를 지어내지 않게 한다. */
    private static String goalLine(WeeklyMetrics m) {
        if (m.weeklyGoalMinutes() == null) {
            return "설정 안 함 (목표 관련 문장은 '목표를 정해 보라'는 권유까지만 허용)";
        }
        if (m.goalAchievementRate() == null) {
            // 주 단위가 아닌 기간 — 주간 목표와 비교하면 불공정해서 서버가 달성률을 계산하지 않았다.
            return "하루 %d분 — 이 기간은 주 단위가 아니라 달성률은 계산하지 않음 (목표 대비 부족하다는 평가 금지)"
                    .formatted(m.goalMinutes());
        }
        return "하루 %d분 (주간 %d분) — 이번 주 달성률 %d%%".formatted(
                m.goalMinutes(), m.weeklyGoalMinutes(), m.goalAchievementRate());
    }

    public static String buildUserPrompt(WeeklyMetrics m, List<String> recommendedStretchings) {
        // 전주 세션이 아예 없던 첫 기록 주 여부. 점수·유지율뿐 아니라 이벤트 횟수 표기에도 쓴다.
        boolean prevMissing = m.prevGoodPostureRatio() == null && m.prevTotalScore() == null;
        long periodDays = java.time.temporal.ChronoUnit.DAYS.between(m.weekStart(), m.weekEnd()) + 1;

        StringBuilder daily = new StringBuilder();
        for (WeeklyMetrics.DailyStat d : m.dailyStats()) {
            daily.append("  - ").append(d.date()).append(": 총 학습 ")
                    .append(Math.round(d.totalStudySeconds() / 60.0)).append("분");
            if (d.goodPostureRatio() != null) {
                daily.append(", 자세유지율 ").append(d.goodPostureRatio()).append("%");
            } else {
                daily.append(" (학습 없음)");
            }
            daily.append("\n");
        }

        StringBuilder trend = new StringBuilder();
        for (WeeklyMetrics.WeekTrend w : m.weeklyTrend()) {
            trend.append("  - ").append(w.weekStart()).append(" 주: 순공부 ").append(hours(w.focusedSeconds()));
            if (w.goodPostureRatio() != null) {
                trend.append(", 유지율 ").append(w.goodPostureRatio()).append("%");
            } else {
                trend.append(" (기록 없음)");
            }
            trend.append("\n");
        }

        String stretchings = recommendedStretchings.isEmpty()
                ? "  - (목록 없음 — 스트레칭 동작 이름을 지어내지 말 것)\n"
                : recommendedStretchings.stream()
                        .map(s -> "  - " + s + "\n")
                        .reduce("", String::concat);

        return """
                다음은 학습자의 %s ~ %s (%d일) 데이터입니다.

                [학습]
                - 순공부 시간: %s
                - 총 학습 시간: %s (휴식 %s · 자리비움 %s 포함)
                - 학습 집중률: %s (순공부 ÷ (순공부+자리비움), 휴식은 계산에서 제외)
                - 학습 목표: %s

                [자세 (이번 주 / 전주)]
                - 바른 자세 유지율: %s / %s
                - 자세 종합 점수: %s / %s
                - 목(거북목): %s / %s,  턱 괴기: %s / %s,  어깨 균형: %s / %s

                [나쁜 자세 감지 (이번 주 / 전주)]
                - 합계: %s
                  · 거북목: %s
                  · 턱 괴기: %s
                  · 어깨 균형: %s
                  · 기타(세부 미상): %s
                - 판정 기준: 같은 나쁜 자세가 10초 이상 이어져야 1회로 확정된다. 유지율에는 10초 미만의
                  짧은 흐트러짐 시간도 포함되므로, 감지 0회인데 유지율이 100%%가 아닌 것은 모순이 아니다.

                [집중을 깬 순간 (이번 주 / 전주)]
                - 졸음: %s
                - 휴대폰 사용: %s
                - 경고 누적: %d회

                [스트레칭]
                - 수행 %d/%d회 완료 (0/0이면 알림이 뜰 만큼 긴 세션이 없었을 수 있음)
                - 추천 스트레칭(이 목록의 동작만 권할 것):
                %s
                [최근 4주 흐름]
                %s
                [일별 기록]
                %s
                위 데이터로 코칭 리포트를 작성해주세요.""".formatted(
                m.weekStart(), m.weekEnd(), periodDays,
                hoursMinutes(m.focusedSeconds()), hoursMinutes(m.totalStudySeconds()),
                hoursMinutes(m.breakSeconds()), hoursMinutes(m.awaySeconds()),
                score(m.focusScore()),
                goalLine(m),
                percent(m.goodPostureRatio()), percent(m.prevGoodPostureRatio()),
                score(m.totalScore()), score(m.prevTotalScore()),
                score(m.bodyPartScores().neck()), score(m.prevBodyPartScores().neck()),
                score(m.bodyPartScores().chinRest()), score(m.prevBodyPartScores().chinRest()),
                score(m.bodyPartScores().shoulderTilt()), score(m.prevBodyPartScores().shoulderTilt()),
                counts(m.eventCounts().badPosture(), m.prevEventCounts().badPosture(), prevMissing),
                counts(m.postureBreakdown().forwardHead(), m.prevPostureBreakdown().forwardHead(), prevMissing),
                counts(m.postureBreakdown().chinRest(), m.prevPostureBreakdown().chinRest(), prevMissing),
                counts(m.postureBreakdown().shoulderTilt(), m.prevPostureBreakdown().shoulderTilt(), prevMissing),
                counts(m.postureBreakdown().otherPosture(), m.prevPostureBreakdown().otherPosture(), prevMissing),
                counts(m.eventCounts().drowsy(), m.prevEventCounts().drowsy(), prevMissing),
                phoneLine(m, prevMissing),
                m.warningCount(),
                m.stretchingCompletedCount(), m.stretchingAttemptCount(),
                stretchings,
                trend.toString(),
                daily.toString());
    }
}
