package com.protractor.backend.domain.studyroom.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import com.protractor.backend.domain.studyrecord.service.StudyRecordService;
import com.protractor.backend.domain.studyroom.entity.RoomStatus;
import com.protractor.backend.domain.studyroom.entity.StudyRoom;
import com.protractor.backend.domain.studyroom.repository.StudyRoomRepository;
import com.protractor.backend.domain.studytag.repository.MemberStudyTagRepository;
import com.protractor.backend.global.openvidu.OpenViduService;
import java.util.List;
import java.util.Optional;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * 퇴장 뒤 방 정리.
 *
 * <p>
 * 나가기 버튼과 접속 끊김은 도착 경로가 다르다. 끊김 처리(RoomPresenceTracker)는 세션을 먼저 마무리한 뒤 퇴장을 부르기
 * 때문에, 퇴장 시점에는 열린 기록이 이미 없다. 그때 퇴장이 통째로 실패하면 빈 방이 RUNNING으로 남는다 — 실제로 그렇게
 * 새어 나가던 적이 있어 고정해 둔다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class StudyRoomLeaveTest {

	private static final long ROOM_ID = 7L;
	private static final long MEMBER_ID = 3L;

	@Mock
	private StudyRoomRepository studyRoomRepository;
	@Mock
	private StudyRecordRepository studyRecordRepository;
	@Mock
	private MemberRepository memberRepository;
	@Mock
	private MemberStudyTagRepository memberStudyTagRepository;
	@Mock
	private OpenViduService openViduService;
	@Mock
	private StudyRoomTimerService studyRoomTimerService;
	@Mock
	private StudyRecordService studyRecordService;

	private StudyRoomService service() {
		return new StudyRoomService(studyRoomRepository, studyRecordRepository, memberRepository,
				memberStudyTagRepository, openViduService, studyRoomTimerService, studyRecordService,
				new BCryptPasswordEncoder());
	}

	private StudyRoom runningRoom() {
		return StudyRoom.builder().id(ROOM_ID).hostMemberId(MEMBER_ID).title("방").status(RoomStatus.RUNNING)
				.roomType("FOCUS").maxMembers(6).focusDurationSeconds(3000).breakDurationSeconds(600)
				.stretchingEnabled(true).studyTagId(8L).build();
	}

	/** 방에 아무도 안 남은 상태. 퇴장 뒤 방을 닫아야 하는 경우다. */
	private void givenRoomIsEmptyAfterLeave(StudyRoom room) {
		when(studyRoomRepository.findById(ROOM_ID)).thenReturn(Optional.of(room));
		when(studyRecordRepository.findByStudyRoomIdAndLeftAtIsNull(ROOM_ID)).thenReturn(List.of());
	}

	@Test
	@DisplayName("나가기 버튼 — 마지막 사람이 나가면 방이 닫힌다")
	void 나가기로_빈_방이_닫힌다() {
		StudyRoom room = runningRoom();
		givenRoomIsEmptyAfterLeave(room);
		when(studyRecordRepository.findFirstByStudyRoomIdAndMemberIdAndLeftAtIsNullOrderByIdDesc(ROOM_ID, MEMBER_ID))
				.thenReturn(Optional.of(StudyRecord.start(ROOM_ID, MEMBER_ID)));

		service().leave(ROOM_ID, MEMBER_ID);

		Assertions.assertThat(room.getStatus()).isEqualTo(RoomStatus.ENDED);
		Assertions.assertThat(room.getExpiresAt()).isNotNull(); // 만료가 심겨야 스케줄러가 지운다
	}

	@Test
	@DisplayName("접속 끊김 — 기록이 이미 닫혀 있어도 방은 닫힌다")
	void 기록이_닫혀있어도_방을_닫는다() {
		StudyRoom room = runningRoom();
		givenRoomIsEmptyAfterLeave(room);
		// 끊김 처리가 세션을 먼저 마무리했다 → 열린 기록이 없다
		when(studyRecordRepository.findFirstByStudyRoomIdAndMemberIdAndLeftAtIsNullOrderByIdDesc(ROOM_ID, MEMBER_ID))
				.thenReturn(Optional.empty());

		assertThatCode(() -> service().leave(ROOM_ID, MEMBER_ID)).doesNotThrowAnyException();

		Assertions.assertThat(room.getStatus()).isEqualTo(RoomStatus.ENDED);
		Assertions.assertThat(room.getExpiresAt()).isNotNull();
		// 이미 끝난 세션을 또 종료하지 않는다
		verify(studyRecordService, never()).endByUserExit(anyLong());
	}

	@Test
	@DisplayName("남은 사람이 있으면 방을 닫지 않고 방장만 넘긴다")
	void 사람이_남으면_방장만_넘긴다() {
		StudyRoom room = runningRoom();
		StudyRecord remaining = StudyRecord.start(ROOM_ID, 99L);
		when(studyRoomRepository.findById(ROOM_ID)).thenReturn(Optional.of(room));
		when(studyRecordRepository.findByStudyRoomIdAndLeftAtIsNull(ROOM_ID)).thenReturn(List.of(remaining));
		when(studyRecordRepository.findFirstByStudyRoomIdAndMemberIdAndLeftAtIsNullOrderByIdDesc(ROOM_ID, MEMBER_ID))
				.thenReturn(Optional.of(StudyRecord.start(ROOM_ID, MEMBER_ID)));

		service().leave(ROOM_ID, MEMBER_ID);

		Assertions.assertThat(room.getStatus()).isEqualTo(RoomStatus.RUNNING);
		Assertions.assertThat(room.getHostMemberId()).isEqualTo(99L);
		verify(studyRoomTimerService, never()).stopQuietly(any());
	}
}
