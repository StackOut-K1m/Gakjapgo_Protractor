package com.protractor.backend.domain.schedule.service;

import com.protractor.backend.domain.schedule.dto.ScheduleCreateRequest;
import com.protractor.backend.domain.schedule.dto.ScheduleListResponse;
import com.protractor.backend.domain.schedule.dto.ScheduleResponse;
import com.protractor.backend.domain.schedule.dto.ScheduleUpdateRequest;
import com.protractor.backend.domain.schedule.entity.Schedule;
import com.protractor.backend.domain.schedule.repository.ScheduleRepository;
import com.protractor.backend.global.exception.BusinessException;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ScheduleService {

    private final ScheduleRepository scheduleRepository;

    /** 월 단위 조회. year/month를 안 보내면 이번 달을 조회한다(함께 보내거나 함께 생략해야 한다). */
    public ScheduleListResponse getMonthly(Long memberId, Integer year, Integer month) {
        YearMonth yearMonth = resolveYearMonth(year, month);
        List<Schedule> schedules = scheduleRepository
                .findAllByMemberIdAndTargetDateBetweenOrderByTargetDateAscIdAsc(
                        memberId, yearMonth.atDay(1), yearMonth.atEndOfMonth());
        return ScheduleListResponse.of(yearMonth.getYear(), yearMonth.getMonthValue(), schedules);
    }

    private static final int DEFAULT_UPCOMING_LIMIT = 5;
    private static final int MAX_UPCOMING_LIMIT = 20;

    //다가 오는 일정 관리
    public List<ScheduleResponse> getUpcoming(Long memberId, Integer limit) {
        int size = limit == null ? DEFAULT_UPCOMING_LIMIT : Math.min(Math.max(limit, 1), MAX_UPCOMING_LIMIT);
        return scheduleRepository
                // 날짜 경계는 서버 기본 시간대를 따른다(resolveYearMonth 와 같은 기준). 배포는 Asia/Seoul.
                .findUpcomingDDay(memberId, LocalDate.now(), PageRequest.of(0, size))
                .stream()
                .map(ScheduleResponse::from)
                .toList();
    }

    @Transactional
    public ScheduleResponse create(Long memberId, ScheduleCreateRequest request) {
        Schedule schedule = scheduleRepository.save(Schedule.builder()
                .memberId(memberId)
                .title(request.title().trim())
                .targetDate(request.targetDate())
                .color(normalize(request.color()))
                .dDayEnabled(Boolean.TRUE.equals(request.dDayEnabled()))
                .memo(normalize(request.memo()))
                .build());
        return ScheduleResponse.from(schedule);
    }

    @Transactional
    public ScheduleResponse update(Long memberId, Long scheduleId, ScheduleUpdateRequest request) {
        if (request.hasNoChanges()) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "수정할 내용이 없습니다.");
        }

        Schedule schedule = findOwned(memberId, scheduleId);

        if (request.title() != null) {
            if (request.title().isBlank()) {
                throw new BusinessException(HttpStatus.BAD_REQUEST, "일정 제목은 비울 수 없습니다.");
            }
            schedule.changeTitle(request.title().trim());
        }
        if (request.targetDate() != null) {
            schedule.changeTargetDate(request.targetDate());
        }
        if (request.color() != null) {
            // 빈 문자열은 "색상 제거"다.
            schedule.changeColor(normalize(request.color()));
        }
        if (request.dDayEnabled() != null) {
            schedule.changeDDayEnabled(request.dDayEnabled());
        }
        if (request.memo() != null) {
            // 빈 문자열은 "메모 제거"다.
            schedule.changeMemo(normalize(request.memo()));
        }

        // updatedAt(@PreUpdate)은 flush 시점에 채워지므로, 응답에 새 값을 담으려면 여기서 flush를 강제한다.
        scheduleRepository.saveAndFlush(schedule);
        return ScheduleResponse.from(schedule);
    }

    @Transactional
    public void delete(Long memberId, Long scheduleId) {
        scheduleRepository.delete(findOwned(memberId, scheduleId));
    }

    /** 남의 일정은 존재 여부도 알려주지 않는다 — 없는 것과 똑같이 404로 응답한다. */
    private Schedule findOwned(Long memberId, Long scheduleId) {
        return scheduleRepository.findById(scheduleId)
                .filter(schedule -> schedule.isOwnedBy(memberId))
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "일정을 찾을 수 없습니다."));
    }

    private YearMonth resolveYearMonth(Integer year, Integer month) {
        if (year == null && month == null) {
            return YearMonth.from(LocalDate.now());
        }
        if (year == null || month == null) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "year와 month는 함께 보내야 합니다.");
        }
        if (month < 1 || month > 12) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "month는 1~12 사이여야 합니다.");
        }
        if (year < 2000 || year > 2100) {
            throw new BusinessException(HttpStatus.BAD_REQUEST, "year는 2000~2100 사이여야 합니다.");
        }
        return YearMonth.of(year, month);
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
