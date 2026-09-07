-- 수동 운영 마이그레이션: protractor DB에 한 번만 적용한다.
--
-- 같은 기간의 리포트 중복 행을 정리한다.
--
-- 진행 중인 주차는 "오늘 완성된 것"만 재사용하게 되어 있어서(ReportService.create), 날이
-- 바뀔 때마다 같은 주차 행이 새로 쌓였다. 목록에 2026.08.03~08.09 가 세 줄씩 늘어선 이유다.
-- 코드는 이제 기존 행을 되살려 쓰지만, 이미 쌓인 행은 여기서 지운다.
--
-- 남기는 기준: 같은 (member_id, 기간) 안에서 report_id 가 가장 큰 행 하나.
-- 가장 마지막에 만든 것이고, 진행 중인 주차라면 가장 최근 데이터로 만들어진 것이다.
--
-- reports 를 참조하는 FK 는 없다(schema.sql 확인). 지워도 다른 테이블이 깨지지 않는다.
--
-- 보관소의 PDF 파일은 남는다. 파일 이름이 report_id 를 포함해서 지운 행의 파일은 아무도
-- 가리키지 않는 채로 디스크에 남는다 — 지우는 API 가 없어 여기서는 손대지 않는다.
-- 용량이 문제가 되면 member-*/ 아래에서 살아 있는 report_id 목록과 대조해 정리할 것.
USE protractor;
SET NAMES utf8mb4;

-- 지우기 전에 몇 건이 정리되는지 확인용 (실행해도 아무것도 바뀌지 않는다)
SELECT member_id, period_start_date, period_end_date, COUNT(*) AS 중복행
  FROM reports
 GROUP BY member_id, period_start_date, period_end_date
HAVING COUNT(*) > 1;

DELETE r
  FROM reports r
  JOIN (
        SELECT member_id, period_start_date, period_end_date, MAX(report_id) AS keep_id
          FROM reports
         GROUP BY member_id, period_start_date, period_end_date
       ) latest
    ON r.member_id = latest.member_id
   AND r.period_start_date = latest.period_start_date
   AND r.period_end_date = latest.period_end_date
 WHERE r.report_id <> latest.keep_id;

-- UNIQUE 제약은 걸지 않는다.
--
-- (member_id, period_start_date, period_end_date) 에 UNIQUE 를 걸면 확실하지만, 생성 요청이
-- 겹칠 때 중복 검사와 INSERT 사이가 원자적이지 않아 두 번째 요청이 500 으로 떨어진다.
-- 지금은 코드 쪽에서 기존 행을 되살려 쓰므로 새 행이 늘지 않는다. 제약을 걸려면 INSERT 충돌을
-- 잡아 기존 행을 돌려주는 처리를 함께 넣어야 한다.
