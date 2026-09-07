package com.protractor.backend.domain.mypage.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 최근 스터디 목록의 한 항목. */
public record MyStudyRoomResponse(
        Long roomId,
        String title,
        // WAITING / RUNNING / ENDED — FE의 "진행 중" 배지·"스터디로 이동" 버튼 분기용
        String status,
        // HOST / MEMBER — 시안의 "역할" 표시용
        String role,
        // 이 방에서의 학습 집중률(%) = 순공부 ÷ (총 학습 − 휴식). 기록이 없으면 null.
        BigDecimal attendanceRate,
        // 이 방 누적 학습 시간(초)
        int totalStudySeconds,
        LocalDateTime joinedAt
) {
}
