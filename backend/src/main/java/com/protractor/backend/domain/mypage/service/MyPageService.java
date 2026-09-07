package com.protractor.backend.domain.mypage.service;

import com.protractor.backend.domain.member.dto.MemberResponse;
import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.domain.onboarding.entity.MemberPreference;
import com.protractor.backend.domain.onboarding.repository.MemberPreferenceRepository;
import com.protractor.backend.domain.mypage.dto.MyPageSummaryResponse;
import com.protractor.backend.domain.mypage.dto.MyStudyRoomListResponse;
import com.protractor.backend.domain.mypage.dto.MyStudyRoomResponse;
import com.protractor.backend.domain.mypage.dto.MyStudyRoomRow;
import com.protractor.backend.domain.mypage.dto.StudyTotals;
import com.protractor.backend.domain.mypage.repository.MyPageQueryRepository;
import com.protractor.backend.domain.studyroom.entity.RoomStatus;
import com.protractor.backend.global.exception.BusinessException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MyPageService {

    private static final int MAX_PAGE_SIZE = 50;

    private final MemberRepository memberRepository;
    private final MemberPreferenceRepository memberPreferenceRepository;
    private final MyPageQueryRepository myPageQueryRepository;

    public MyPageSummaryResponse getSummary(Long memberId) {
        MemberResponse profile = memberRepository.findById(memberId)
                .map(MemberResponse::from)
                .orElseThrow(() -> new BusinessException(HttpStatus.NOT_FOUND, "회원을 찾을 수 없습니다."));

        StudyTotals totals = myPageQueryRepository.sumTotals(memberId);
        long activeStudyCount = myPageQueryRepository.countRoomsNotEnded(memberId, RoomStatus.ENDED);

        // 온보딩의 하루 목표(분). 온보딩 전이거나 목표를 안 정했으면 null이다.
        Integer goalMinutes = memberPreferenceRepository.findById(memberId)
                .map(MemberPreference::getGoalMinutes)
                .orElse(null);

        return new MyPageSummaryResponse(
                profile,
                activeStudyCount,
                attendanceRate(totals.focusedSeconds(), totals.awaySeconds()),
                totals.totalStudySeconds(),
                goalMinutes,
                goalMinutes == null ? null : goalMinutes * 7
        );
    }

    public MyStudyRoomListResponse getMyStudyRooms(Long memberId, int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
            throw new BusinessException(HttpStatus.BAD_REQUEST,
                    "page는 0 이상, size는 1~" + MAX_PAGE_SIZE + " 사이여야 합니다.");
        }

        Page<MyStudyRoomRow> rows = myPageQueryRepository.findRecentRooms(memberId, PageRequest.of(page, size));
        List<MyStudyRoomResponse> items = rows.getContent().stream()
                .map(row -> toResponse(memberId, row))
                .toList();
        return MyStudyRoomListResponse.of(rows, items);
    }

    private MyStudyRoomResponse toResponse(Long memberId, MyStudyRoomRow row) {
        String role = memberId.equals(row.getHostMemberId()) ? "HOST" : "MEMBER";
        // 합계는 SUM 결과라 기록이 없으면 null이 올 수 있다.
        long totalStudySeconds = row.getTotalStudySeconds() == null ? 0L : row.getTotalStudySeconds();
        long focusedSeconds = row.getFocusedSeconds() == null ? 0L : row.getFocusedSeconds();
        long awaySeconds = row.getAwaySeconds() == null ? 0L : row.getAwaySeconds();
        return new MyStudyRoomResponse(
                row.getRoomId(),
                row.getTitle(),
                row.getStatus(),
                role,
                attendanceRate(focusedSeconds, awaySeconds),
                (int) totalStudySeconds,
                row.getJoinedAt()
        );
    }

    /**
     * 학습 집중률 = 순공부 시간 ÷ (총 학습 시간 − 휴식 시간) (0~100, 소수 2자리).
     *
     * <p>
     * 총 학습 시간은 순공부+휴식+자리비움의 합이므로(StudyRecord.syncProgress) 분모 "총 − 휴식"은
     * "순공부+자리비움"과 같다. 이 형태로 계산하면 어떤 값이 와도 100을 넘지 않는다.
     * 휴식(쉬는 시간·스트레칭)은 방 운영이 쉬라고 정한 시간이라 분모에서 뺀다 — 분모에 넣으면
     * 쉴수록 집중률이 깎이고, 분자에 넣으면(옛 식) 쉴수록 부풀었다.
     *
     * <p>
     * 분모가 0이면(기록이 없거나 전부 휴식) null이다 — FE는 "-"로 표시한다.
     * 응답 키는 명세를 따라 attendanceRate를 유지하며 화면 라벨만 "학습 집중률"이다.
     * 정의가 또 바뀌면 이 메서드만 고치면 된다. 패키지 전용인 것은 단위 테스트가 직접 부르기 위해서다.
     */
    static BigDecimal attendanceRate(long focusedSeconds, long awaySeconds) {
        long presentSeconds = focusedSeconds + awaySeconds;
        if (presentSeconds <= 0) {
            return null;
        }
        return BigDecimal.valueOf(focusedSeconds * 100)
                .divide(BigDecimal.valueOf(presentSeconds), 2, RoundingMode.HALF_UP);
    }
}
