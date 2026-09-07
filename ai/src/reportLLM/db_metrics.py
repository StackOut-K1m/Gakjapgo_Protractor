# DB(protractor) 실데이터 집계 모듈 — MOCK_METRICS 를 대체하는 실제 집계 쿼리.
# 여기서 확정한 SQL이 나중에 BE 리포트 도메인(Java)으로 이식된다.
#
# 접속 정보: ai/.env 의 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
#
# 스키마 참고 (최신 SQL 정의서 기준):
#   - study_records: total_study_seconds, focused_seconds, good_posture_ratio,
#     neck_score, chin_rest_score(구 shoulder_score), shoulder_tilt_score(구 back_score 대체), total_score,
#     warning_count, stretching_attempt_count, stretching_completed_count, joined_at
#   - events: event_type(POSTURE/DROWSY/...), detail, started_at (study_record_id로 연결)
import os
from datetime import date, timedelta

import pymysql


def _conn():
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "protractor"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def _period_stats(cur, member_id: int, d_from: date, d_to: date) -> dict:
    """한 기간의 study_records 집계."""
    cur.execute(
        """
        SELECT
          COALESCE(SUM(total_study_seconds), 0)        AS totalStudySeconds,
          COALESCE(SUM(focused_seconds), 0)            AS focusedSeconds,
          ROUND(AVG(good_posture_ratio))               AS goodPostureRatio,
          ROUND(AVG(total_score))                      AS totalScore,
          ROUND(AVG(focus_score))                      AS focusScore,
          ROUND(AVG(neck_score))                       AS neckScore,
          ROUND(AVG(chin_rest_score))                  AS shoulderScore,
          ROUND(AVG(shoulder_tilt_score))              AS shoulderTiltScore,
          COALESCE(SUM(warning_count), 0)              AS warningCount,
          COALESCE(SUM(stretching_attempt_count), 0)   AS stretchingAttemptCount,
          COALESCE(SUM(stretching_completed_count), 0) AS stretchingCompletedCount
        FROM study_records
        WHERE member_id = %s AND joined_at >= %s AND joined_at < %s
        """,
        (member_id, d_from, d_to + timedelta(days=1)),
    )
    return cur.fetchone()


def _event_counts(cur, member_id: int, d_from: date, d_to: date) -> dict:
    """한 기간의 감지 이벤트 카운트 (events ⨝ study_records)."""
    cur.execute(
        """
        SELECT
          SUM(e.event_type = 'POSTURE')                    AS badPosture,
          SUM(e.event_type = 'DROWSY')                     AS drowsy,
          SUM(e.event_type = 'AWAY' OR e.detail = 'AWAY')  AS away
        FROM events e
        JOIN study_records r ON r.study_record_id = e.study_record_id
        WHERE r.member_id = %s AND e.started_at >= %s AND e.started_at < %s
        """,
        (member_id, d_from, d_to + timedelta(days=1)),
    )
    row = cur.fetchone()
    return {k: int(row[k] or 0) for k in ("badPosture", "drowsy", "away")}


def _daily_stats(cur, member_id: int, d_from: date, d_to: date) -> list[dict]:
    """일별 집계 (없는 날은 0/None 채움)."""
    cur.execute(
        """
        SELECT DATE(joined_at) AS d,
               SUM(total_study_seconds) AS total,
               SUM(focused_seconds)     AS focused,
               ROUND(AVG(good_posture_ratio)) AS ratio
        FROM study_records
        WHERE member_id = %s AND joined_at >= %s AND joined_at < %s
        GROUP BY DATE(joined_at)
        """,
        (member_id, d_from, d_to + timedelta(days=1)),
    )
    by_date = {row["d"].isoformat(): row for row in cur.fetchall()}

    out = []
    cur_d = d_from
    while cur_d <= d_to:
        key = cur_d.isoformat()
        row = by_date.get(key)
        out.append({
            "date": key,
            "studyMinutes": round((row["total"] or 0) / 60) if row else 0,
            "totalStudySeconds": int(row["total"] or 0) if row else 0,
            "focusedSeconds": int(row["focused"] or 0) if row else 0,
            "goodPostureRatio": int(row["ratio"]) if row and row["ratio"] is not None else None,
        })
        cur_d += timedelta(days=1)
    return out


def fetch_metrics(member_id: int, week_start: date) -> dict:
    """주간(월~일) 실데이터 집계 → report_llm_test.MOCK_METRICS 와 동일한 구조로 반환."""
    d_from = week_start
    d_to = week_start + timedelta(days=6)
    prev_from = d_from - timedelta(days=7)
    prev_to = d_from - timedelta(days=1)

    with _conn() as conn, conn.cursor() as cur:
        cur_stats = _period_stats(cur, member_id, d_from, d_to)
        prev_stats = _period_stats(cur, member_id, prev_from, prev_to)
        cur_events = _event_counts(cur, member_id, d_from, d_to)
        prev_events = _event_counts(cur, member_id, prev_from, prev_to)
        daily = _daily_stats(cur, member_id, d_from, d_to)

    def num(v, default=0):
        return int(v) if v is not None else default

    return {
        "period": {"from": d_from.isoformat(), "to": d_to.isoformat()},
        "totalStudySeconds": num(cur_stats["totalStudySeconds"]),
        "focusedSeconds": num(cur_stats["focusedSeconds"]),
        "goodPostureRatio": num(cur_stats["goodPostureRatio"]),
        "prevGoodPostureRatio": num(prev_stats["goodPostureRatio"]),
        "totalScore": num(cur_stats["totalScore"]),
        "prevTotalScore": num(prev_stats["totalScore"]),
        "focusScore": num(cur_stats["focusScore"]),
        # 최신 스키마: back_score → shoulder_tilt_score. 프롬프트 호환을 위해 키는 유지하되 값 매핑.
        "bodyPartScores": {
            "neck": num(cur_stats["neckScore"]),
            "shoulder": num(cur_stats["shoulderScore"]),
            "shoulderTilt": num(cur_stats["shoulderTiltScore"]),
        },
        "prevBodyPartScores": {
            "neck": num(prev_stats["neckScore"]),
            "shoulder": num(prev_stats["shoulderScore"]),
            "shoulderTilt": num(prev_stats["shoulderTiltScore"]),
        },
        "eventCounts": cur_events,
        "prevEventCounts": prev_events,
        "warningCount": num(cur_stats["warningCount"]),
        "stretchingAttemptCount": num(cur_stats["stretchingAttemptCount"]),
        "stretchingCompletedCount": num(cur_stats["stretchingCompletedCount"]),
        "dailyStats": daily,
    }


if __name__ == "__main__":
    # 단독 실행: 접속·집계 쿼리 동작 확인용
    import json
    import sys
    from report_llm_test import load_env_file

    load_env_file()
    member_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    monday = date.today() - timedelta(days=date.today().weekday())
    print(f"member_id={member_id}, week_start={monday}")
    print(json.dumps(fetch_metrics(member_id, monday), ensure_ascii=False, indent=2, default=str))
