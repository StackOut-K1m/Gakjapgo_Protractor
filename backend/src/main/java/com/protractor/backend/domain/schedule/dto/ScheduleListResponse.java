package com.protractor.backend.domain.schedule.dto;

import com.protractor.backend.domain.schedule.entity.Schedule;
import java.util.List;

public record ScheduleListResponse(
        // 조회한 연/월을 함께 돌려줘 FE가 어떤 달의 응답인지 확인할 수 있게 한다.
        int year,
        int month,
        List<ScheduleResponse> schedules
) {
    public static ScheduleListResponse of(int year, int month, List<Schedule> schedules) {
        List<ScheduleResponse> items = schedules.stream().map(ScheduleResponse::from).toList();
        return new ScheduleListResponse(year, month, items);
    }
}
