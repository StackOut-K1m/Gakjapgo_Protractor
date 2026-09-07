package com.protractor.backend.domain.studyroom.service;

import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.repository.MemberRepository;
import com.protractor.backend.domain.studyrecord.entity.StudyRecord;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository;
import com.protractor.backend.domain.studyrecord.repository.StudyRecordRepository.RoomMemberCount;
import com.protractor.backend.domain.studyrecord.service.StudyRecordService;
import com.protractor.backend.domain.studyroom.dto.CreateStudyRoomRequest;
import com.protractor.backend.domain.studyroom.dto.JoinRoomRequest;
import com.protractor.backend.domain.studyroom.dto.JoinRoomResponse;
import com.protractor.backend.domain.studyroom.dto.LeaveRoomResponse;
import com.protractor.backend.domain.studyroom.dto.ParticipantResponse;
import com.protractor.backend.domain.studyroom.dto.PreparationResponse;
import com.protractor.backend.domain.studyroom.dto.RecommendedStudyRoomResponse;
import com.protractor.backend.domain.studyroom.dto.StudyRoomListResponse;
import com.protractor.backend.domain.studyroom.dto.StudyRoomResponse;
import com.protractor.backend.domain.studyroom.dto.TimerResponse;
import com.protractor.backend.domain.studyroom.dto.UpdateStudyRoomRequest;
import com.protractor.backend.domain.studyroom.dto.UpdateTimerRequest;
import com.protractor.backend.domain.studyroom.dto.VerifyPasswordRequest;
import com.protractor.backend.domain.studyroom.entity.RoomStatus;
import com.protractor.backend.domain.studyroom.entity.StudyRoom;
import com.protractor.backend.domain.studyroom.repository.StudyRoomRepository;
import com.protractor.backend.domain.studytag.repository.MemberStudyTagRepository;
import com.protractor.backend.global.openvidu.OpenViduService;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Slf4j
@Service
@RequiredArgsConstructor
public class StudyRoomService {

	private static final String DEFAULT_ROOM_TYPE = "FOCUS";
	private static final int DEFAULT_MAX_MEMBERS = 6;
	private static final int DEFAULT_FOCUS_SECONDS = 3000;
	private static final int DEFAULT_BREAK_SECONDS = 600;
	// 카테고리 미지정 시 기본 study_tag. JPA INSERT는 컬럼 DEFAULT를 안 타므로 서비스에서 채운다.
	private static final long DEFAULT_STUDY_TAG_ID = 8L;

	private final StudyRoomRepository studyRoomRepository;
	private final StudyRecordRepository studyRecordRepository;
	private final MemberRepository memberRepository;
	private final MemberStudyTagRepository memberStudyTagRepository;
	private final OpenViduService openViduService;
	private final StudyRoomTimerService studyRoomTimerService;
	private final StudyRecordService studyRecordService;
	// 회원 비밀번호와 같은 인코더(BCrypt)를 쓴다. 방 비밀번호도 평문으로 두면 DB가 새는 순간 그대로 노출된다.
	private final PasswordEncoder passwordEncoder;

	@Transactional
	public StudyRoomResponse create(Long hostMemberId, CreateStudyRoomRequest request) {
		StudyRoom room = StudyRoom.builder().hostMemberId(hostMemberId).title(request.title())
				.status(RoomStatus.WAITING)
				.roomType(request.roomType() != null ? request.roomType() : DEFAULT_ROOM_TYPE)
				.maxMembers(request.maxMembers() != null ? request.maxMembers() : DEFAULT_MAX_MEMBERS)
				.plannedDurationSeconds(request.plannedDurationSeconds())
				.focusDurationSeconds(
						request.focusDurationSeconds() != null ? request.focusDurationSeconds() : DEFAULT_FOCUS_SECONDS)
				.breakDurationSeconds(
						request.breakDurationSeconds() != null ? request.breakDurationSeconds() : DEFAULT_BREAK_SECONDS)
				.stretchingEnabled(request.stretchingEnabled() == null || request.stretchingEnabled())
				.studyTagId(request.studyTagId() != null ? request.studyTagId() : DEFAULT_STUDY_TAG_ID)
				.hashTags(request.hashTags()).isLocked(request.isLocked() != null && request.isLocked())
				.password(encodeRoomPassword(request.password())).rules(request.rules()).description(request.description())
				.thumbnailImageUrl(request.thumbnailImageUrl()).build();
		validateLockSetting(room);
		// 개설만 하고 입장하지 않은 방이 영구히 쌓이지 않게 만료 시각을 심는다. 입장하면 해제된다.
		room.scheduleExpiry(RoomLifecyclePolicy.WAITING_TTL);
		// 저장해야 id가 채워진다. save를 빼면 roomId=null 응답만 나가고 방은 만들어지지 않는다.
		return StudyRoomResponse.from(studyRoomRepository.save(room), 0);
	}

	/**
	 * 방 목록. 상태를 지정하지 않으면 사람이 있는 방(RUNNING)만 보여 준다.
	 *
	 * <p>
	 * WAITING과 ENDED는 곧 바뀌거나 사라지는 과도기다(설계 결정 9-5). 목록에 띄워도 들어가면 아무도 없다. 상태를
	 * 명시하면 그 상태로 조회되므로 확인이 필요할 때는 {@code ?status=WAITING}으로 볼 수 있다.
	 */
	@Transactional(readOnly = true)
	public StudyRoomListResponse getList(String keyword, RoomStatus status, String roomType, Pageable pageable) {
		RoomStatus effectiveStatus = status != null ? status : RoomStatus.RUNNING;
		Page<StudyRoom> page = studyRoomRepository.search(emptyToNull(keyword), effectiveStatus, roomType, pageable);
		List<Long> roomIds = page.getContent().stream().map(StudyRoom::getId).toList();
		// 참여자 0인 방은 쿼리 결과에 없으므로 from()에서 0으로 채운다. 빈 목록이면 IN절을 아예 태우지 않는다.
		Map<Long, Integer> memberCounts = roomIds.isEmpty() ? Map.of()
				: studyRecordRepository.countActiveByRoomIds(roomIds).stream()
						.collect(Collectors.toMap(RoomMemberCount::getRoomId, c -> (int) c.getMemberCount()));
		return StudyRoomListResponse.from(page, memberCounts);
	}

	/**
	 * 관심 태그가 일치하는 방을 우선 추천한다. 일치 후보가 모자라면 최근 활성 방이 뒤를 채운다.
	 * 후보 수를 제한해 전체 활성 방 수와 무관하게 홈 요청 비용을 예측 가능하게 유지한다.
	 */
	@Transactional(readOnly = true)
	public List<RecommendedStudyRoomResponse> getRecommendations(Long memberId, int size) {
		int candidateLimit = Math.max(size * 20, 60);
		java.util.Set<Long> interestedTagIds = memberStudyTagRepository.findTagsByMemberId(memberId).stream()
				.map(tag -> tag.getId()).collect(Collectors.toSet());
		List<StudyRoom> candidates = new java.util.ArrayList<>();
		if (!interestedTagIds.isEmpty()) {
			candidates.addAll(studyRoomRepository.findRecommendableCandidatesByStudyTagIds(memberId, RoomStatus.RUNNING,
					interestedTagIds.stream().toList(), org.springframework.data.domain.PageRequest.of(0, candidateLimit)));
		}
		candidates.addAll(studyRoomRepository.findRecommendableCandidates(memberId, RoomStatus.RUNNING,
				org.springframework.data.domain.PageRequest.of(0, candidateLimit)));
		if (candidates.isEmpty()) {
			return List.of();
		}

		Map<Long, StudyRoom> candidatesById = candidates.stream()
				.collect(Collectors.toMap(StudyRoom::getId, room -> room, (first, ignored) -> first));
		List<StudyRoom> uniqueCandidates = new java.util.ArrayList<>(candidatesById.values());
		List<Long> roomIds = uniqueCandidates.stream().map(StudyRoom::getId).toList();
		Map<Long, Integer> memberCounts = studyRecordRepository.countActiveByRoomIds(roomIds).stream()
				.collect(Collectors.toMap(RoomMemberCount::getRoomId, count -> (int) count.getMemberCount()));

		return uniqueCandidates.stream()
				.filter(room -> memberCounts.getOrDefault(room.getId(), 0) < room.getMaxMembers())
				.sorted(Comparator
						.comparing((StudyRoom room) -> interestedTagIds.contains(room.getStudyTagId())).reversed()
						.thenComparing(Comparator.comparing((StudyRoom room) -> isComfortablyAvailable(room,
								memberCounts.getOrDefault(room.getId(), 0))).reversed())
						.thenComparing(StudyRoom::getCreatedAt, Comparator.reverseOrder())
						.thenComparing(StudyRoom::getId, Comparator.reverseOrder()))
				.limit(size)
				.map(room -> RecommendedStudyRoomResponse.from(room, memberCounts.getOrDefault(room.getId(), 0),
						interestedTagIds.contains(room.getStudyTagId())))
				.toList();
	}

	private boolean isComfortablyAvailable(StudyRoom room, int currentMembers) {
		return currentMembers > 0 && currentMembers * 10 <= room.getMaxMembers() * 7;
	}

	@Transactional(readOnly = true)
	public StudyRoomResponse get(Long roomId) {
		StudyRoom room = findActiveOrThrow(roomId);
		int currentMembers = (int) studyRecordRepository.countByStudyRoomIdAndLeftAtIsNull(roomId);
		return StudyRoomResponse.from(room, currentMembers);
	}

	@Transactional
	public StudyRoomResponse update(Long roomId, Long memberId, UpdateStudyRoomRequest request) {
		StudyRoom room = findActiveOrThrow(roomId);
		validateHost(room, memberId);
		room.update(request.title(), request.maxMembers(), request.focusDurationSeconds(),
				request.breakDurationSeconds(), request.stretchingEnabled(), request.studyTagId(), request.hashTags(),
				request.isLocked(), encodeRoomPassword(request.password()), request.rules(), request.description(),
				request.thumbnailImageUrl());
		// PATCH라 isLocked만 켜고 비밀번호를 안 보낼 수 있다. 합쳐진 결과를 봐야 알 수 있어 수정 뒤에 확인한다.
		// 여기서 던지면 트랜잭션이 되돌아가므로 잘못된 상태가 저장되지 않는다.
		validateLockSetting(room);
		// 수정 후에도 현재 인원을 실제 값으로 내려준다. 0을 넣으면 참여자가 있어도 0명으로 표시된다.
		int currentMembers = (int) studyRecordRepository.countByStudyRoomIdAndLeftAtIsNull(roomId);
		return StudyRoomResponse.from(room, currentMembers);
	}

	@Transactional
	public void delete(Long roomId, Long memberId) {
		StudyRoom room = findActiveOrThrow(roomId);
		validateHost(room, memberId);
		room.softDelete();
	}

	/**
	 * 입장하지 않고 비밀번호만 맞는지 본다. 맞으면 그냥 끝나고, 틀리면 403이다.
	 *
	 * <p>
	 * 화면용이다. 비밀번호는 방을 고른 창에서 받는데 검증은 팝업으로 열린 준비 화면의 입장 API에서 일어나서, 틀린 걸
	 * 카메라·모델 로딩·캘리브레이션을 모두 마친 뒤에야 알게 된다. 그때는 팝업 안에 다시 입력할 자리가 없어 사용자가 갇힌다.
	 * 창을 열기 전에 여기서 먼저 걸러 준다.
	 *
	 * <p>
	 * <b>이 API가 잠금을 담당하는 것은 아니다.</b> 이걸 건너뛰고 입장 API를 직접 부를 수 있으므로 실제로 막는 곳은
	 * 여전히 {@link #join}이다. 둘 다 있어야 하고, 하나를 지우면 다른 하나가 대신하지 못한다.
	 */
	@Transactional(readOnly = true)
	public void verifyPassword(Long roomId, VerifyPasswordRequest request) {
		StudyRoom room = findActiveOrThrow(roomId);
		if (!room.isLocked()) {
			// 공개 방을 확인하러 온 것은 화면이 방 상태를 잘못 알고 있다는 뜻이다. 막을 이유는 없어 통과시킨다.
			return;
		}
		verifyRoomPassword(room, request.password());
	}

	@Transactional
	public JoinRoomResponse join(Long roomId, Long memberId, JoinRoomRequest request) {
		StudyRoom room = findActiveOrThrow(roomId);
		if (!Boolean.TRUE.equals(request.cameraChecked()) || !Boolean.TRUE.equals(request.postureChecked())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Camera and posture pre-checks are required.");
		}

		// 아직 나가지 않은 기록이 있으면 그것이 지금 진행 중인 세션이다. 날짜로 찾지 않는 이유는 자정 때문이다 —
		// 23시 50분에 들어와 새벽 0시 10분에 새로고침하면 "오늘 행"은 아직 없고, 어제 행이 열려 있다.
		// 그 경우 새 행을 만들면 열린 기록이 둘이 되어 정원이 두 번 세어진다. 날짜를 나누는 일은
		// progress의 롤오버가 맡는다(StudyRecordService 참고).
		StudyRecord existing = studyRecordRepository
				.findFirstByStudyRoomIdAndMemberIdAndLeftAtIsNullOrderByIdDesc(roomId, memberId)
				// 열린 기록이 없으면 오늘 행을 찾는다. 오늘 나갔다 다시 들어오는 경우 같은 행에 이어 쌓는다.
				.or(() -> studyRecordRepository.findByStudyRoomIdAndMemberIdAndStudyDate(roomId, memberId,
						LocalDate.now()))
				.orElse(null);
		// 이미 방에 있는 회원의 중복 입장 요청은 정원 체크 없이 그대로 통과시킨다(멱등).
		// 새로 들어오거나 나갔다 다시 들어오는 경우에만 현재 인원이 정원을 넘지 않는지 확인한다.
		boolean alreadyInRoom = existing != null && existing.isActive();
		if (!alreadyInRoom) {
			// 정원보다 먼저 본다. 들어올 자격이 없는 사람에게 방이 몇 명인지 알려 줄 이유가 없다.
			verifyRoomPassword(room, request.password());
			long currentMembers = studyRecordRepository.countByStudyRoomIdAndLeftAtIsNull(roomId);
			if (currentMembers >= room.getMaxMembers()) {
				throw new ResponseStatusException(HttpStatus.CONFLICT,
						"정원이 가득 찼습니다. (정원 " + room.getMaxMembers() + "명)");
			}
		}

		StudyRecord record;
		if (existing != null) {
			existing.rejoin(); // 나갔던 회원이면 퇴장 시각을 지워 되살린다.
			record = existing;
		} else {
			record = studyRecordRepository.save(StudyRecord.start(roomId, memberId));
		}

		// 사람이 들어왔으므로 방은 진행중이다. 만료 예약과 이전 종료 흔적도 여기서 풀린다.
		// ENDED였던 방에 다시 들어온 경우도 같은 경로로 살아난다(설계 결정 9-2).
		room.startSession();

		// 타이머는 방장이 들어올 때만 시작한다. 초대 링크로 방장 아닌 사람이 먼저 들어올 수 있는데,
		// 그때 타이머가 돌기 시작하면 방장은 아직 준비 화면에 있는데 집중 시간이 깎인다.
		// 이미 돌고 있으면 아무것도 하지 않는다(입장 API는 준비 화면과 스터디룸에서 두 번 불린다).
		if (room.getHostMemberId().equals(memberId)) {
			studyRoomTimerService.startIfAbsent(room);
		}

		String openviduSessionId = "study-room-" + roomId;
		// 화상 토큰 발급이 실패해도 입장 자체는 성립시킨다. 예외를 던지면 트랜잭션이 되돌아가 방금 만든
		// 스터디 기록까지 사라지는데, 그 id가 자세 판정·학습 시간의 세션 식별자다. 기록 없이 방에 들어가면
		// 이후 모든 요청이 존재하지 않는 세션을 가리켜 404가 된다. 화상이 없어도 학습과 자세 판정은 돌아간다.
		String mediaToken = null;
		try {
			mediaToken = openViduService.issueToken(openviduSessionId);
		} catch (Exception e) {
			log.warn("OpenVidu 토큰 발급 실패 — 화상 없이 입장한다. room={}, member={}, cause={}", roomId, memberId,
					e.getMessage());
		}
		return new JoinRoomResponse(roomId, memberId, record.getId(), openviduSessionId, mediaToken);
	}

	@Transactional(readOnly = true)
	public List<ParticipantResponse> getParticipants(Long roomId) {
		findActiveOrThrow(roomId);
		List<StudyRecord> records = studyRecordRepository.findByStudyRoomIdAndLeftAtIsNull(roomId);
		// 닉네임과 프로필 사진은 members에 있다. 참여자마다 조회하면 N+1이라 한 번에 가져와 맵으로 만든다.
		Map<Long, Member> members = memberRepository
				.findAllById(records.stream().map(StudyRecord::getMemberId).toList()).stream()
				.collect(Collectors.toMap(Member::getId, member -> member));
		return records.stream().map(r -> ParticipantResponse.from(r, members.get(r.getMemberId()))).toList();
	}

	@Transactional
	public LeaveRoomResponse leave(Long roomId, Long memberId) {
		StudyRecord record = studyRecordRepository
				.findFirstByStudyRoomIdAndMemberIdAndLeftAtIsNullOrderByIdDesc(roomId, memberId).orElse(null);

		if (record != null) {
			// 점수·자세 통계를 여기서 확정한다. 예전에는 나가기 경로가 퇴장 시각만 남겨서, 프론트가 종료 API를
			// 빠뜨리면 점수가 비어 있는 기록이 남았다(이탈 경로는 서버가 계산한다). 이미 종료된 세션이면 아무것도
			// 하지 않으므로, 프론트가 정상적으로 종료를 부른 경우와 결과가 같다.
			//
			// 예외를 잡지 않는 것은 의도한 것이다. 같은 트랜잭션이라 여기서 삼켜도 커밋이 되돌아가 의미가 없고,
			// 실패해 퇴장이 되돌아가더라도 연결이 끊기면 유예 뒤 이탈 경로가 같은 일을 다시 한다.
			studyRecordService.endByUserExit(record.getId());
			record.leave();
		}

		// 기록이 이미 닫혀 있어도 방 정리는 반드시 한다.
		//
		// 이탈 처리(RoomPresenceTracker)는 세션을 먼저 마무리하고 이 메서드를 부른다. 그래서 여기 왔을 때는
		// 열린 기록이 없다. 예전에는 그 경우 NOT_FOUND를 던져 방장 위임과 빈 방 정리가 통째로 건너뛰어졌고,
		// 아무도 없는 방이 RUNNING으로 남았다.
		closeOrTransferHost(roomId, memberId);
		return new LeaveRoomResponse(roomId, memberId, record != null ? record.getLeftAt() : null);
	}

	/**
	 * 퇴장 후 방을 정리한다.
	 *
	 * <p>
	 * 아무도 남지 않으면 방을 종료(ENDED) 상태로 두고, 나간 사람이 방장이었다면 남은 사람 중 공부를 가장 많이 한 사람에게
	 * 방장을 넘긴다. 방장이 나갔다고 방을 닫아 버리면 공부 중인 나머지 사람들이 같이 쫓겨나기 때문이다.
	 *
	 * <p>
	 * 예전에는 빈 방을 바로 소프트 삭제했다. 그러면 잘못 눌러 나간 사람이 돌아올 방법이 없어, 짧은 만료 시간을 두고
	 * 스케줄러가 지우도록 바꿨다(설계 결정 9-2). 참여 기록(study_records)은 통계를 위해 그대로 남는다.
	 */
	private void closeOrTransferHost(Long roomId, Long leftMemberId) {
		// 방이 이미 없어졌을 수 있어 조회 실패는 조용히 넘긴다(퇴장 자체는 성공해야 한다).
		StudyRoom room = studyRoomRepository.findById(roomId).orElse(null);
		if (room == null) {
			return;
		}

		List<StudyRecord> remaining = studyRecordRepository.findByStudyRoomIdAndLeftAtIsNull(roomId);
		if (remaining.isEmpty()) {
			// 방이 비었으니 도는 타이머도 멈춘다. 안 멈추면 아무도 없는 방의 페이즈가 계속 넘어간다.
			studyRoomTimerService.stopQuietly(roomId);
			room.endSession(RoomLifecyclePolicy.END_REASON_EMPTY, RoomLifecyclePolicy.ENDED_TTL);
			return;
		}

		if (!room.getHostMemberId().equals(leftMemberId)) {
			return; // 방장이 아니면 넘길 것이 없다.
		}

		// 공부 시간이 가장 긴 사람에게 넘긴다. 같으면 먼저 들어온 사람이 이어받는다.
		StudyRecord nextHost = remaining.stream()
				.max(Comparator.comparingInt(StudyRecord::getFocusedSeconds)
						.thenComparing(Comparator.comparing(StudyRecord::getJoinedAt).reversed()))
				.orElseThrow();
		room.changeHost(nextHost.getMemberId());
	}

	@Transactional(readOnly = true)
	public PreparationResponse getPreparation(Long roomId) {
		StudyRoom room = findActiveOrThrow(roomId);
		long participantsCount = studyRecordRepository.countByStudyRoomIdAndLeftAtIsNull(roomId);
		return new PreparationResponse(room.getTitle(), (int) participantsCount, true, true);
	}

	@Transactional(readOnly = true)
	public TimerResponse getTimer(Long roomId) {
		return TimerResponse.from(findActiveOrThrow(roomId), null);
	}

	@Transactional
	public TimerResponse updateTimer(Long roomId, Long memberId, UpdateTimerRequest request) {
		StudyRoom room = findActiveOrThrow(roomId);
		validateHost(room, memberId);
		Integer focusSeconds = toSeconds(request.focusMinutes());
		Integer breakSeconds = toSeconds(request.breakMinutes());
		room.update(null, null, focusSeconds, breakSeconds, request.stretchingEnabled(), null, null, null, null, null,
				null, null);

		/*
		 * 돌고 있는 타이머에도 알려 준다.
		 *
		 * 이걸 빼면 DB 값만 바뀌고 화면은 그대로였다 — 타이머가 시작할 때 값을 메모리로 복사해
		 * 두고 그것만 쓰기 때문에, 방을 다시 만들거나 서버를 재시작해야 새 값이 먹었다.
		 *
		 * 지금 도는 구간은 그대로 끝나고 다음부터 적용된다(applySettings 주석 참고).
		 */
		studyRoomTimerService.applySettings(roomId, focusSeconds, breakSeconds);
		return TimerResponse.from(room, memberId);
	}

	private Integer toSeconds(Integer minutes) {
		return minutes == null ? null : minutes * 60;
	}

	private StudyRoom findActiveOrThrow(Long roomId) {
		return studyRoomRepository.findById(roomId).orElseThrow(
				() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Study room not found: " + roomId));
	}

	private void validateHost(StudyRoom room, Long memberId) {
		if (!room.getHostMemberId().equals(memberId)) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the room host can update this room.");
		}
	}

	/**
	 * 잠긴 방의 입장 비밀번호를 확인한다.
	 *
	 * <p>
	 * 프론트에도 비밀번호 입력 화면이 있지만 그것은 화면 흐름일 뿐이다. 입장 API를 직접 부르면 그 화면을 거치지 않으므로
	 * 실제로 막는 곳은 여기여야 한다.
	 *
	 * <p>
	 * 이미 방에 있는 회원에게는 묻지 않는다(호출부 조건). 입장 API는 준비 화면과 스터디룸에서 두 번 불리고 새로고침으로도
	 * 다시 불리는데, 그때마다 비밀번호를 요구하면 정상 입장이 중간에 막힌다.
	 */
	private void verifyRoomPassword(StudyRoom room, String provided) {
		if (!room.isLocked()) {
			return;
		}
		String stored = room.getPassword();
		if (stored == null || stored.isBlank()) {
			// 잠갔다고 표시됐는데 비밀번호가 없는 방. 대조할 값이 없다고 통과시키면 잠금이 무의미해지므로 막는다.
			// 개설·수정에서 막고 있으니 이 로그가 찍히면 그 이전에 만들어진 데이터라는 뜻이다.
			log.error("잠긴 방에 비밀번호가 없습니다. room={}", room.getId());
			throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "방 설정이 올바르지 않습니다. 방장에게 문의해 주세요.");
		}
		// 저장값은 해시라 문자열 비교가 안 된다. 인코더가 대조한다.
		// null을 그대로 넘기면 인코더가 IllegalArgumentException을 던지므로 먼저 거른다.
		if (provided == null || provided.isBlank() || !passwordEncoder.matches(provided, stored)) {
			// 입력값은 남기지 않는다. 로그에 비밀번호가 그대로 쌓인다.
			log.info("스터디룸 비밀번호 불일치. room={}", room.getId());
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "비밀번호가 일치하지 않습니다.");
		}
	}

	/**
	 * 방 비밀번호를 저장용 해시로 바꾼다.
	 *
	 * <p>
	 * 값이 없으면 null을 돌려준다. 수정(PATCH)에서 null은 "이 필드는 건드리지 않는다"는 뜻이라, 비밀번호를 안 보낸
	 * 요청이 기존 값을 지우지 않는다.
	 */
	private String encodeRoomPassword(String rawPassword) {
		return (rawPassword == null || rawPassword.isBlank()) ? null : passwordEncoder.encode(rawPassword);
	}

	/**
	 * 잠근 방에는 비밀번호가 있어야 한다.
	 *
	 * <p>
	 * 이 조합이 깨지면 입장에서 대조할 값이 없어진다. 통과시키면 잠금이 이름뿐이고, 막으면 방장이 자기 방에 못 들어간다.
	 * 어느 쪽도 답이 아니라서 애초에 만들어지지 않게 개설·수정에서 거른다.
	 */
	private void validateLockSetting(StudyRoom room) {
		if (room.isLocked() && (room.getPassword() == null || room.getPassword().isBlank())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비공개 방은 비밀번호가 필요합니다.");
		}
	}

	private String emptyToNull(String value) {
		return (value == null || value.isBlank()) ? null : value;
	}
}
