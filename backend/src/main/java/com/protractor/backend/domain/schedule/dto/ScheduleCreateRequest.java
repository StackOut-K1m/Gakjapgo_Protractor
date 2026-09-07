package com.protractor.backend.domain.schedule.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record ScheduleCreateRequest(
        @NotBlank(message = "일정 제목을 입력해주세요.")
        @Size(max = 100, message = "일정 제목은 100자 이하여야 합니다.")
        String title,

        // 지난 날짜도 허용한다(지난 일정을 기록해 두는 용도).
        @NotNull(message = "일정 날짜를 입력해주세요.")
        LocalDate targetDate,

        @Size(max = 20, message = "색상 값은 20자 이하여야 합니다.")
        String color,

        // 미전송이면 꺼짐으로 저장한다.
        Boolean dDayEnabled,

        @Size(max = 500, message = "메모는 500자 이하여야 합니다.")
        String memo
) {
}
