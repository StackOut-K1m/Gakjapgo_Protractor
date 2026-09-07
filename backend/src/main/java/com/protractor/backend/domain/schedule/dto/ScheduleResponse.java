package com.protractor.backend.domain.schedule.dto;

import com.protractor.backend.domain.schedule.entity.Schedule;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record ScheduleResponse(
        Long scheduleId,
        String title,
        LocalDate targetDate,
        String color,
        boolean dDayEnabled,
        String memo,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static ScheduleResponse from(Schedule schedule) {
        return new ScheduleResponse(
                schedule.getId(),
                schedule.getTitle(),
                schedule.getTargetDate(),
                schedule.getColor(),
                schedule.isDDayEnabled(),
                schedule.getMemo(),
                schedule.getCreatedAt(),
                schedule.getUpdatedAt()
        );
    }
}
