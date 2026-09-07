package com.protractor.backend.domain.studyroom.controller;

import com.protractor.backend.domain.studyroom.dto.ChatMessageResponse;
import com.protractor.backend.domain.studyroom.dto.CreateStudyRoomRequest;
import com.protractor.backend.domain.studyroom.dto.JoinRoomRequest;
import com.protractor.backend.domain.studyroom.dto.JoinRoomResponse;
import com.protractor.backend.domain.studyroom.dto.LeaveRoomResponse;
import com.protractor.backend.domain.studyroom.dto.MediaStateResponse;
import com.protractor.backend.domain.studyroom.dto.ParticipantResponse;
import com.protractor.backend.domain.studyroom.dto.PreparationResponse;
import com.protractor.backend.domain.studyroom.dto.RecommendedStudyRoomResponse;
import com.protractor.backend.domain.studyroom.dto.StudyRoomListResponse;
import com.protractor.backend.domain.studyroom.dto.StudyRoomResponse;
import com.protractor.backend.domain.studyroom.dto.TimerResponse;
import com.protractor.backend.domain.studyroom.dto.TimerStateResponse;
import com.protractor.backend.domain.studyroom.dto.UpdateStudyRoomRequest;
import com.protractor.backend.domain.studyroom.dto.UpdateTimerRequest;
import com.protractor.backend.domain.studyroom.dto.VerifyPasswordRequest;
import com.protractor.backend.domain.studyroom.entity.RoomStatus;
import com.protractor.backend.domain.studyroom.service.ChatHistoryService;
import com.protractor.backend.domain.studyroom.service.MediaStateService;
import com.protractor.backend.domain.studyroom.service.StudyRoomEventPublisher;
import com.protractor.backend.domain.studyroom.service.StudyRoomService;
import com.protractor.backend.domain.studyroom.service.StudyRoomTimerService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "StudyRoom", description = "스터디룸 API")
@RestController
@RequestMapping("/api/v1/study-rooms")
@RequiredArgsConstructor
public class StudyRoomController {

	private final StudyRoomService studyRoomService;
	private final StudyRoomEventPublisher studyRoomEventPublisher;
	private final StudyRoomTimerService studyRoomTimerService;
	private final MediaStateService mediaStateService;
	private final ChatHistoryService chatHistoryService;

	@Operation(summary = "스터디룸 목록 조회", description = "키워드·상태·유형 필터와 페이지네이션을 지원한다. "
			+ "status를 넘기지 않으면 RUNNING으로 고정된다 — 대기 중이거나 끝난 방을 보려면 status를 명시해야 한다. "
			+ "정렬은 createdAt·title·maxMembers만 받고, 그 밖의 값은 createdAt으로 되돌린다.")
	@GetMapping
	public StudyRoomListResponse getList(
			@Parameter(description = "방 제목 검색어") @RequestParam(name = "keyword", required = false) String keyword,
			@Parameter(description = "방 상태. 생략하면 RUNNING") @RequestParam(name = "status", required = false) RoomStatus status,
			@Parameter(description = "방 유형") @RequestParam(name = "roomType", required = false) String roomType,
			@Parameter(description = "페이지 번호, 0부터 시작") @RequestParam(name = "page", defaultValue = "0") int page,
			@Parameter(description = "페이지 크기, 1~100") @RequestParam(name = "size", defaultValue = "20") int size,
			@Parameter(description = "정렬값. 예: createdAt,desc") @RequestParam(name = "sort", defaultValue = "createdAt,desc") String sort) {
		Pageable pageable = PageRequest.of(normalizePage(page), normalizeSize(size), parseSort(sort));
		return studyRoomService.getList(keyword, status, roomType, pageable);
	}

	@Operation(summary = "스터디룸 상세 조회")
	@GetMapping("/{roomId}")
	public StudyRoomResponse get(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId) {
		return studyRoomService.get(roomId);
	}

	@Operation(summary = "개인화 스터디룸 추천", description = "관심 태그가 일치하는 입장 가능 활성 방을 우선 조회한다.")
	@GetMapping("/recommendations")
	public List<RecommendedStudyRoomResponse> recommendations(Authentication authentication,
			@Parameter(description = "반환 개수, 1~10") @RequestParam(defaultValue = "3") int size) {
		return studyRoomService.getRecommendations(currentMemberId(authentication), Math.min(Math.max(size, 1), 10));
	}

	@Operation(summary = "스터디룸 생성")
	@ResponseStatus(HttpStatus.CREATED)
	@PostMapping
	public StudyRoomResponse create(Authentication authentication, @Valid @RequestBody CreateStudyRoomRequest request) {
		return studyRoomService.create(currentMemberId(authentication), request);
	}

	@Operation(summary = "스터디룸 수정", description = "방장만 수정할 수 있다. 입력한 값만 부분 수정한다.")
	@PatchMapping("/{roomId}")
	public StudyRoomResponse update(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId,
			Authentication authentication, @Valid @RequestBody UpdateStudyRoomRequest request) {
		return studyRoomService.update(roomId, currentMemberId(authentication), request);
	}

	@Operation(summary = "스터디룸 삭제", description = "deleted_at을 채우는 소프트 삭제 방식이다. 방장만 삭제할 수 있다. "
			+ "안에 사람이 있어도 삭제되며, 남아 있는 참여자를 내보내거나 그들의 스터디 기록을 닫지는 않는다 — "
			+ "각자 연결이 끊겨 이탈 처리될 때 정리된다.")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@DeleteMapping("/{roomId}")
	public void delete(@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId,
			Authentication authentication) {
		studyRoomService.delete(roomId, currentMemberId(authentication));
	}

	@Operation(summary = "스터디룸 비밀번호 확인", description = "입장하지 않고 비밀번호만 맞는지 확인한다. 맞으면 200, 틀리면 403이다. "
			+ "준비 화면 팝업을 열기 전에 미리 걸러 주는 용도이며, 잠금 자체는 입장 API가 담당한다"
			+ "(이 API를 건너뛰고 입장을 직접 부를 수 있다). 공개 방은 확인할 것이 없어 200이다.")
	@PostMapping("/{roomId}/verify-password")
	public void verifyPassword(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId,
			@Valid @RequestBody VerifyPasswordRequest request) {
		studyRoomService.verifyPassword(roomId, request);
	}

	@Operation(summary = "스터디룸 입장", description = "스터디 기록을 만들거나 재입장 처리하고 OpenVidu 접속 토큰을 발급한다. "
			+ "비공개 방은 password가 일치해야 하며 틀리면 403이다. 이미 방에 있는 회원의 재호출은 비밀번호를 묻지 않는다"
			+ "(입장 API는 준비 화면·스터디룸·새로고침에서 여러 번 불린다).")
	@PostMapping("/{roomId}/join")
	public JoinRoomResponse join(@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId,
			Authentication authentication, @Valid @RequestBody JoinRoomRequest request) {
		Long memberId = currentMemberId(authentication);
		JoinRoomResponse response = studyRoomService.join(roomId, memberId, request);
		// 입장이 성공(커밋)한 뒤, 방 전원에게 입장 알림을 실시간 전파한다.
		studyRoomEventPublisher.participantJoined(roomId, memberId);
		return response;
	}

	@Operation(summary = "최근 채팅 조회", description = "방의 최근 대화를 오래된 순으로 조회한다. 새로고침·재접속했을 때 이전 대화를 이어 보여주는 용도이며, DB에 저장하지 않아 서버가 재시작되면 비어 있다.")
	@GetMapping("/{roomId}/messages")
	public List<ChatMessageResponse> recentMessages(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId) {
		return chatHistoryService.getRecent(roomId);
	}

	@Operation(summary = "미디어 상태 목록 조회", description = "방 참여자들의 카메라·마이크·화면공유 상태를 조회한다. 입장 직후 현재 상태를 맞추는 용도이며, 이후 변화는 WebSocket으로 전달된다.")
	@GetMapping("/{roomId}/media-states")
	public List<MediaStateResponse> mediaStates(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId) {
		return mediaStateService.getAll(roomId);
	}

	@Operation(summary = "참여자 목록 조회", description = "아직 나가지 않은 참여자 목록을 조회한다.")
	@GetMapping("/{roomId}/participants")
	public List<ParticipantResponse> participants(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId) {
		return studyRoomService.getParticipants(roomId);
	}

	@Operation(summary = "스터디룸 나가기", description = "퇴장 시각만 남기는 것이 아니라 세션 마무리까지 한 번에 처리한다. "
			+ "① 아직 열려 있는 스터디 기록을 종료하고 감지 이벤트를 집계해 점수를 확정한다(프론트가 종료 API를 이미 불렀으면 건너뛴다) "
			+ "② 퇴장 시각을 남긴다 ③ 나간 사람이 방장이면 다음 사람에게 방장을 넘긴다 ④ 마지막 한 명이었으면 방을 ENDED로 바꾼다. "
			+ "열린 기록이 없어도 ③④는 그대로 수행한다.")
	@PostMapping("/{roomId}/leave")
	public LeaveRoomResponse leave(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId,
			Authentication authentication) {
		Long memberId = currentMemberId(authentication);
		LeaveRoomResponse response = studyRoomService.leave(roomId, memberId);
		// 나간 사람의 미디어 상태를 지운다. 남겨두면 없는 사람이 계속 목록에 뜬다.
		mediaStateService.remove(roomId, memberId);
		// 퇴장이 성공(커밋)한 뒤, 방 전원에게 퇴장 알림을 실시간 전파한다.
		studyRoomEventPublisher.participantLeft(roomId, memberId);
		return response;
	}

	@Operation(summary = "스터디룸 입장 준비 정보 조회", description = "방 제목, 현재 인원, 카메라/자세인식 필요 여부를 조회한다.")
	@GetMapping("/{roomId}/preparation")
	public PreparationResponse preparation(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId) {
		return studyRoomService.getPreparation(roomId);
	}

	@Operation(summary = "방 타이머 설정 조회", description = "집중/휴식 시간과 스트레칭 사용 여부를 조회한다.")
	@GetMapping("/{roomId}/timer")
	public TimerResponse getTimer(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId) {
		return studyRoomService.getTimer(roomId);
	}

	@Operation(summary = "방 타이머 설정 변경", description = "방장만 타이머 설정을 변경할 수 있다. "
			+ "이미 돌고 있는 구간은 바뀌지 않는다 — 새 값은 그 구간이 끝나고 다음에 같은 구간이 시작될 때부터 적용된다. "
			+ "집중 10분에서 3분으로 줄여도 지금 도는 집중 구간은 10분을 채우고, 그다음 집중부터 3분이 된다.")
	@PatchMapping("/{roomId}/timer")
	public TimerResponse updateTimer(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId,
			Authentication authentication, @Valid @RequestBody UpdateTimerRequest request) {
		return studyRoomService.updateTimer(roomId, currentMemberId(authentication), request);
	}

	@Operation(summary = "방 타이머 현재 진행 상태 조회", description = "진행 중인 페이즈와 남은 시간을 조회한다. 늦게 입장한 사람이 동기화할 때 쓴다. 실행 중이 아니면 running=false.")
	@GetMapping("/{roomId}/timer/state")
	public TimerStateResponse getTimerState(
			@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId) {
		return studyRoomTimerService.getState(roomId);
	}

	@Operation(summary = "방 타이머 시작(방장)", description = "집중↔휴식 사이클을 시작한다. 페이즈 전환은 WebSocket으로 전파된다.")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PostMapping("/{roomId}/timer/start")
	public void startTimer(@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId,
			Authentication authentication) {
		studyRoomTimerService.start(roomId, currentMemberId(authentication));
	}

	@Operation(summary = "방 타이머 정지(방장)", description = "진행 중인 타이머를 멈춘다.")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@PostMapping("/{roomId}/timer/stop")
	public void stopTimer(@Parameter(description = "스터디룸 ID", example = "2") @PathVariable("roomId") Long roomId,
			Authentication authentication) {
		studyRoomTimerService.stop(roomId, currentMemberId(authentication));
	}

	private Long currentMemberId(Authentication authentication) {
		return (Long) authentication.getPrincipal();
	}

	private int normalizePage(int page) {
		return Math.max(page, 0);
	}

	private int normalizeSize(int size) {
		return Math.min(Math.max(size, 1), 100);
	}

	private Sort parseSort(String sort) {
		String normalized = sort == null ? "" : sort.replace("[", "").replace("]", "").replace("\"", "").trim();
		if (normalized.isBlank()) {
			return Sort.by(Sort.Direction.DESC, "createdAt");
		}

		String[] parts = normalized.split(",", 2);
		String property = allowedSortProperty(parts[0].trim());
		Sort.Direction direction = parts.length > 1 && "asc".equalsIgnoreCase(parts[1].trim()) ? Sort.Direction.ASC
				: Sort.Direction.DESC;
		return Sort.by(direction, property);
	}

	private String allowedSortProperty(String property) {
		return List.of("createdAt", "title", "maxMembers").contains(property) ? property : "createdAt";
	}
}
