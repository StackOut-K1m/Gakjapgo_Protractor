package com.protractor.backend.domain.schedule.dto;

import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** 일정 수정 요청. null인 필드는 건드리지 않는다(부분 수정). color·memo는 빈 문자열로 지울 수 있다. */
public record ScheduleUpdateRequest(
        // 제목은 비울 수 없다 — 빈 문자열이 오면 서비스가 400으로 거른다.
        @Size(max = 100, message = "일정 제목은 100자 이하여야 합니다.")
        String title,

        LocalDate targetDate,

        @Size(max = 20, message = "색상 값은 20자 이하여야 합니다.")
        String color,

        Boolean dDayEnabled,

        @Size(max = 500, message = "메모는 500자 이하여야 합니다.")
        String memo
) {
    public boolean hasNoChanges() {
        return title == null && targetDate == null && color == null
                && dDayEnabled == null && memo == null;
    }
}
