package com.protractor.backend.domain.studyroom.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import com.protractor.backend.domain.studyrecord.service.StudyRecordService;
import com.protractor.backend.domain.studyroom.dto.CreateStudyRoomRequest;
import com.protractor.backend.domain.studyroom.dto.JoinRoomRequest;
import com.protractor.backend.domain.studyroom.dto.VerifyPasswordRequest;
import com.protractor.backend.domain.studyroom.entity.RoomStatus;
import com.protractor.backend.domain.studyroom.entity.StudyRoom;
import com.protractor.backend.domain.studyroom.repository.StudyRoomRepository;
import com.protractor.backend.domain.studytag.repository.MemberStudyTagRepository;
import com.protractor.backend.global.openvidu.OpenViduService;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

/**
 * 비공개 방 비밀번호 검증.
 *
 * <p>
 * 프론트에도 입력 화면이 있지만 입장 API를 직접 부르면 그 화면을 거치지 않는다. 실제로 막는 곳이 여기라서, 통과해야 할 경우와
 * 막아야 할 경우를 모두 고정해 둔다.
 *
 * <p>
 * 인코더는 목이 아니라 진짜 {@link BCryptPasswordEncoder}를 쓴다. 저장할 때 해싱하고 대조할 때 푸는 왕복이 실제로
 * 맞물리는지가 이 테스트의 핵심이기 때문이다.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class StudyRoomPasswordTest {

	private static final long ROOM_ID = 2L;
	private static final long HOST_ID = 100L;
	private static final long GUEST_ID = 200L;
	private static final String RAW_PASSWORD = "1234";

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

	private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

	private StudyRoomService service() {
		return new StudyRoomService(studyRoomRepository, studyRecordRepository, memberRepository,
				memberStudyTagRepository, openViduService, studyRoomTimerService, studyRecordService, passwordEncoder);
	}

	/** 저장된 방을 흉내 낸다. password는 이미 해싱된 값이 들어 있어야 실제와 같다. */
	private StudyRoom room(boolean locked, String storedPassword) {
		return StudyRoom.builder().id(ROOM_ID).hostMemberId(HOST_ID).title("테스트 방").status(RoomStatus.WAITING)
				.roomType("FOCUS").maxMembers(6).focusDurationSeconds(3000).breakDurationSeconds(600)
				.stretchingEnabled(true).studyTagId(8L).isLocked(locked).password(storedPassword).build();
	}

	private JoinRoomRequest joinWith(String password) {
		return new JoinRoomRequest(true, true, password);
	}

	private void givenRoom(StudyRoom room) {
		when(studyRoomRepository.findById(ROOM_ID)).thenReturn(Optional.of(room));
	}

	/** 아직 이 방에 기록이 없는 사람 = 처음 들어오는 사람. */
	private void givenNewcomer() {
		when(studyRecordRepository.findFirstByStudyRoomIdAndMemberIdAndLeftAtIsNullOrderByIdDesc(ROOM_ID, GUEST_ID))
				.thenReturn(Optional.empty());
		when(studyRecordRepository.findByStudyRoomIdAndMemberIdAndStudyDate(eq(ROOM_ID), eq(GUEST_ID), any()))
				.thenReturn(Optional.empty());
		when(studyRecordRepository.countByStudyRoomIdAndLeftAtIsNull(ROOM_ID)).thenReturn(0L);
		when(studyRecordRepository.save(any(StudyRecord.class)))
				.thenAnswer(invocation -> invocation.getArgument(0));
	}

	/** 이 방에 이 회원의 기록이 아직 없는 상태. 열린 기록도, 오늘 행도 없다. */
	private void givenNoRecordToday() {
		when(studyRecordRepository.findFirstByStudyRoomIdAndMemberIdAndLeftAtIsNullOrderByIdDesc(ROOM_ID, GUEST_ID))
				.thenReturn(Optional.empty());
		when(studyRecordRepository.findByStudyRoomIdAndMemberIdAndStudyDate(eq(ROOM_ID), eq(GUEST_ID), any()))
				.thenReturn(Optional.empty());
	}

	private ResponseStatusException joinExpectingFailure(StudyRoomService service, String password) {
		return catchThrowableOfType(() -> service.join(ROOM_ID, GUEST_ID, joinWith(password)),
				ResponseStatusException.class);
	}

	@Nested
	@DisplayName("잠긴 방에 처음 들어올 때")
	class LockedRoom {

		@Test
		@DisplayName("비밀번호가 맞으면 들어갈 수 있다")
		void 비밀번호가_맞으면_입장한다() {
			givenRoom(room(true, passwordEncoder.encode(RAW_PASSWORD)));
			givenNewcomer();
			// OpenVidu 토큰은 굳이 흉내 내지 않는다. 발급이 실패해도 입장은 성립시키는 것이 의도된 동작이다.

			assertThatCode(() -> service().join(ROOM_ID, GUEST_ID, joinWith(RAW_PASSWORD))).doesNotThrowAnyException();
		}

		@Test
		@DisplayName("비밀번호가 틀리면 403이고, 입장 기록을 만들지 않는다")
		void 비밀번호가_틀리면_403() {
			givenRoom(room(true, passwordEncoder.encode(RAW_PASSWORD)));
			givenNoRecordToday();

			ResponseStatusException e = joinExpectingFailure(service(), "9999");

			assertThat(e.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
			verify(studyRecordRepository, never()).save(any(StudyRecord.class));
		}

		@Test
		@DisplayName("비밀번호를 아예 안 보내도 403이다 — 예전엔 이대로 통과했다")
		void 비밀번호를_안_보내면_403() {
			givenRoom(room(true, passwordEncoder.encode(RAW_PASSWORD)));
			givenNoRecordToday();

			assertThat(joinExpectingFailure(service(), null).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
		}

		@Test
		@DisplayName("잠겼는데 저장된 비밀번호가 없으면 통과시키지 않는다")
		void 저장된_비밀번호가_없으면_막는다() {
			givenRoom(room(true, null));
			givenNoRecordToday();

			assertThat(joinExpectingFailure(service(), RAW_PASSWORD).getStatusCode())
					.isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
		}
	}

	@Nested
	@DisplayName("비밀번호를 묻지 않아야 하는 경우")
	class NoPasswordNeeded {

		@Test
		@DisplayName("공개 방은 비밀번호 없이 들어간다")
		void 공개_방은_그냥_들어간다() {
			givenRoom(room(false, null));
			givenNewcomer();

			assertThatCode(() -> service().join(ROOM_ID, GUEST_ID, joinWith(null))).doesNotThrowAnyException();
		}

		@Test
		@DisplayName("이미 방에 있으면 다시 묻지 않는다 — 입장 API는 준비 화면·스터디룸·새로고침에서 여러 번 불린다")
		void 이미_방에_있으면_묻지_않는다() {
			givenRoom(room(true, passwordEncoder.encode(RAW_PASSWORD)));
			// left_at이 비어 있는 기록 = 아직 방에 있는 사람
			StudyRecord active = StudyRecord.start(ROOM_ID, GUEST_ID);
			when(studyRecordRepository.findFirstByStudyRoomIdAndMemberIdAndLeftAtIsNullOrderByIdDesc(ROOM_ID, GUEST_ID)).thenReturn(Optional.of(active));

			assertThatCode(() -> service().join(ROOM_ID, GUEST_ID, joinWith(null))).doesNotThrowAnyException();
		}
	}

	@Nested
	@DisplayName("입장 전 비밀번호 확인 (verify-password)")
	class VerifyBeforeJoin {

		private ResponseStatusException verifyExpectingFailure(String password) {
			return catchThrowableOfType(() -> service().verifyPassword(ROOM_ID, new VerifyPasswordRequest(password)),
					ResponseStatusException.class);
		}

		@Test
		@DisplayName("맞으면 통과한다")
		void 맞으면_통과() {
			givenRoom(room(true, passwordEncoder.encode(RAW_PASSWORD)));

			assertThatCode(() -> service().verifyPassword(ROOM_ID, new VerifyPasswordRequest(RAW_PASSWORD)))
					.doesNotThrowAnyException();
		}

		@Test
		@DisplayName("틀리면 403 — 입장 때와 같은 상태코드다")
		void 틀리면_403() {
			givenRoom(room(true, passwordEncoder.encode(RAW_PASSWORD)));

			assertThat(verifyExpectingFailure("9999").getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
		}

		@Test
		@DisplayName("확인만 할 뿐 입장 기록을 남기지 않는다")
		void 입장_기록을_남기지_않는다() {
			givenRoom(room(true, passwordEncoder.encode(RAW_PASSWORD)));

			service().verifyPassword(ROOM_ID, new VerifyPasswordRequest(RAW_PASSWORD));

			verify(studyRecordRepository, never()).save(any(StudyRecord.class));
		}

		@Test
		@DisplayName("공개 방은 확인할 것이 없어 통과한다")
		void 공개_방은_통과() {
			givenRoom(room(false, null));

			assertThatCode(() -> service().verifyPassword(ROOM_ID, new VerifyPasswordRequest("아무거나")))
					.doesNotThrowAnyException();
		}
	}

	@Nested
	@DisplayName("방을 만들 때")
	class OnCreate {

		private CreateStudyRoomRequest createRequest(Boolean locked, String password) {
			return new CreateStudyRoomRequest("테스트 방", null, null, null, null, null, null, 8L, null, locked, password,
					null, null, null);
		}

		@Test
		@DisplayName("잠근 방에 비밀번호가 없으면 400으로 막는다")
		void 잠갔는데_비밀번호가_없으면_400() {
			ResponseStatusException e = catchThrowableOfType(() -> service().create(HOST_ID, createRequest(true, null)),
					ResponseStatusException.class);

			assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
			verify(studyRoomRepository, never()).save(any(StudyRoom.class));
		}

		@Test
		@DisplayName("비밀번호는 평문으로 저장하지 않는다")
		void 비밀번호를_해싱해서_저장한다() {
			when(studyRoomRepository.save(any(StudyRoom.class))).thenAnswer(i -> i.getArgument(0));
			when(studyRecordRepository.countByStudyRoomIdAndLeftAtIsNull(anyLong())).thenReturn(0L);

			service().create(HOST_ID, createRequest(true, RAW_PASSWORD));

			org.mockito.ArgumentCaptor<StudyRoom> saved = org.mockito.ArgumentCaptor.forClass(StudyRoom.class);
			verify(studyRoomRepository).save(saved.capture());
			assertThat(saved.getValue().getPassword()).isNotEqualTo(RAW_PASSWORD);
			assertThat(passwordEncoder.matches(RAW_PASSWORD, saved.getValue().getPassword())).isTrue();
		}
	}
}
