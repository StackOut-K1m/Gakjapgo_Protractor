package com.protractor.backend.domain.mypage.dto;

import com.protractor.backend.domain.member.dto.MemberResponse;
import java.math.BigDecimal;

/** 마이페이지 상단 요약 카드용 응답. */
public record MyPageSummaryResponse(
        MemberResponse profile,
        // 참여 중인 스터디 수(아직 종료되지 않은 방)
        long activeStudyCount,
        // 학습 집중률(%) = 순공부 시간 ÷ (총 학습 시간 − 휴식 시간). 기록이 없으면 null — FE는 "-"로 표시한다.
        // 키 이름이 attendanceRate인 이유는 MyPageService.attendanceRate 주석 참고.
        BigDecimal attendanceRate,
        // 총 학습 시간. 이름은 명세(totalStudyTime)를 따르되 단위는 초다 — 시간·분 표시는 FE가 변환한다.
        long totalStudyTime,
        // 온보딩에서 설정한 하루 목표 학습 시간(분). 미설정이면 null.
        Integer goalMinutes,
        // 주간 목표(분) = 하루 목표 × 7. 서버가 계산해 내려준다. 미설정이면 null.
        Integer weeklyGoalMinutes
) {
}
