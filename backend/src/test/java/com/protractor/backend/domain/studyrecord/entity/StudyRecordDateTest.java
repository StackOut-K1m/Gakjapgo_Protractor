package com.protractor.backend.domain.studyrecord.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 학습 기록이 "어느 날짜의 공부인지"를 지키는지 확인한다.
 *
 * <p>
 * joinedAt은 랭킹·리포트·알림·학습요약 네 곳이 기간을 자를 때 쓰는 기준이다. 한 행에 시간을 누적하는 구조라서 이 값이
 * 흔들리면 이미 쌓인 시간이 통째로 다른 날로 옮겨 간다. 눈에 잘 안 띄는 대신 결과는 크게 틀리는 종류라 고정해 둔다.
 */
class StudyRecordDateTest {

	private static final long ROOM_ID = 1L;
	private static final long MEMBER_ID = 2L;

	@Test
	@DisplayName("재입장해도 시작 시각은 그대로다 — 어제 공부가 오늘로 옮겨 가면 안 된다")
	void 재입장이_시작시각을_밀지_않는다() {
		StudyRecord record = StudyRecord.start(ROOM_ID, MEMBER_ID);
		LocalDateTime firstJoin = record.getJoinedAt();
		// 어제 3시간 공부하고 정상 종료한 상태를 만든다.
		record.end(10_800, 0, 0, "USER_EXIT");

		record.rejoin();

		assertThat(record.getJoinedAt()).isEqualTo(firstJoin);
		assertThat(record.getFocusedSeconds()).isEqualTo(10_800); // 쌓인 시간도 그대로 남는다
	}

	@Test
	@DisplayName("재입장하면 다시 방에 있는 상태가 되고 종료 사유가 지워진다")
	void 재입장이_종료흔적을_지운다() {
		StudyRecord record = StudyRecord.start(ROOM_ID, MEMBER_ID);
		record.end(600, 0, 0, "USER_EXIT");
		assertThat(record.isActive()).isFalse();

		record.rejoin();

		// endReason이 남아 있으면 progress/end가 "이미 종료된 세션"으로 보고 409를 낸다.
		assertThat(record.getEndReason()).isNull();
		assertThat(record.isActive()).isTrue();
	}

	@Test
	@DisplayName("새 기록은 서버 기준 오늘 날짜를 갖는다")
	void 새_기록은_오늘_날짜다() {
		StudyRecord record = StudyRecord.start(ROOM_ID, MEMBER_ID);

		assertThat(record.getStudyDate()).isEqualTo(LocalDate.now());
	}

	@Test
	@DisplayName("자정 롤오버로 만든 다음 날 기록은 넘겨받은 시간부터 시작한다")
	void 롤오버_기록은_넘겨받은_시간부터() {
		LocalDate tomorrow = LocalDate.now().plusDays(1);

		// 마지막 동기화 이후 자정을 지나 쌓인 40초를 다음 날로 넘긴다.
		StudyRecord next = StudyRecord.startFrom(ROOM_ID, MEMBER_ID, tomorrow, 40);

		assertThat(next.getStudyDate()).isEqualTo(tomorrow);
		assertThat(next.getFocusedSeconds()).isEqualTo(40);
		assertThat(next.getTotalStudySeconds()).isEqualTo(40);
		assertThat(next.isActive()).isTrue(); // 아직 방에 있는 상태로 시작한다
	}

	@Test
	@DisplayName("넘길 시간이 음수로 계산돼도 0으로 막는다")
	void 넘긴_시간은_음수가_되지_않는다() {
		StudyRecord next = StudyRecord.startFrom(ROOM_ID, MEMBER_ID, LocalDate.now(), -5);

		assertThat(next.getFocusedSeconds()).isZero();
	}

	@Test
	@DisplayName("진행 동기화는 누적값을 더하지 않고 덮어쓴다")
	void 진행동기화는_덮어쓴다() {
		StudyRecord record = StudyRecord.start(ROOM_ID, MEMBER_ID);

		record.syncProgress(100, 20, 5);
		record.syncProgress(300, 60, 10); // 전송이 한 번 빠져도 다음 값에 전체가 들어 있다

		assertThat(record.getFocusedSeconds()).isEqualTo(300);
		assertThat(record.getTotalStudySeconds()).isEqualTo(370); // 서버가 합산한다
	}
}
