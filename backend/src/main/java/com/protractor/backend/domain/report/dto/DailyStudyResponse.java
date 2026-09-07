package com.protractor.backend.domain.report.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 하루치 학습 요약. 학습 캘린더가 달 단위로 받아 각 칸을 채운다.
 *
 * <p>
 * 주간 요약(GET /reports/me/summary)은 월~일 7일로 고정이라 달력(6주 42칸)을 채우려면 다섯 번을
 * 불러야 한다. 그래서 임의 기간을 하루 단위로 돌려주는 자리를 따로 뒀다.
 *
 * <p>
 * 기록이 없는 날은 아예 항목이 없다 — 0시간 공부한 날과 구분되어야 한다.
 *
 * @param goodPostureRatio 바른 자세 유지율(0~100). 그날 자세 측정이 없으면 null이다.
 * @param roomTitles 그날 참여한 방 이름. 같은 방을 여러 번 드나들어도 한 번만 담긴다.
 */
public record DailyStudyResponse(
        LocalDate date,
        long totalStudySeconds,
        long focusedSeconds,
        Integer goodPostureRatio,
        List<String> roomTitles) {
}
