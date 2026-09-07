// src/types/room.ts

/**
 * 다른 참여자에게 보이는 코칭 상태. 화상 타일 테두리 색이 이 값을 따른다.
 *
 * - `none`       평소
 * - `warning`    자세 경고가 떠 있는 중(빨강). 경고는 5회에 스트레칭으로 넘어가므로 그 이하 구간이다
 * - `stretching` 스트레칭 수행 중(노랑)
 *
 * 자세 판정 자체는 각자 브라우저에서만 돌고 서버는 결과만 안다. 그래서 "지금 누가 경고 중인지"는
 * 이 값을 직접 주고받지 않으면 다른 사람이 알 방법이 없다.
 */
export type CoachingState = 'none' | 'warning' | 'stretching';

/** 코칭 상태 전파 이벤트. 보낸 사람은 서버가 인증 정보로 붙여 주므로 위조할 수 없다. */
export interface CoachingStateEvent {
  memberId: number;
  state: CoachingState;
}

export interface Participant {
  id: string;
  name: string;
  /**
   * 프로필 사진 주소. 안 올렸으면 없고, 그때는 닉네임 첫 글자로 대신한다.
   *
   * 채팅 말풍선의 사진도 이 값을 쓴다 — 메시지마다 주소를 실어 보내면 같은 사람이 100번
   * 말할 때 같은 값이 100번 오간다. 보낸 사람은 authorId 로 여기서 찾는다.
   */
  profileImageUrl?: string | null;
  /** 본인 여부 — 본인 타일에만 로컬 카메라를 붙인다 */
  isSelf: boolean;
  cameraOn: boolean;
  micOn: boolean;
  /**
   * 화면을 공유하는 중인지.
   *
   * 화상 타일은 카메라를 거울처럼 좌우로 뒤집어 보여 주는데, 화면공유는 카메라 트랙만
   * 갈아끼우는 방식이라 그 반전이 그대로 남아 글자까지 뒤집힌다. 타일이 이 값을 알아야
   * 공유 중에만 반전을 끌 수 있다.
   */
  screenSharing: boolean;
  /**
   * 이 사람이 지금 경고 중인지·스트레칭 중인지. 타일 테두리 색이 여기서 나온다.
   *
   * 서버가 보관하지 않는 값이라 늦게 들어온 사람은 모른 채 시작한다. 대신 누가 들어오면
   * 각자가 자기 상태를 한 번 더 알린다(useRoomSocket 참고).
   */
  coachingState: CoachingState;
}

export interface ChatMessage {
  id: string;
  /**
   * 보낸 사람의 memberId(문자열). 연속 메시지를 한 덩어리로 묶을 때 쓴다.
   * 닉네임으로 묶으면 동명이인의 말이 한 사람 것처럼 붙어 버린다.
   */
  authorId: string;
  authorName: string;
  /** 'HH:MM' 또는 '오후 8:15' 형태의 표시용 문자열 */
  sentAt: string;
  body: string;
  /**
   * 내가 보낸 메시지인지. 말풍선을 오른쪽에 붙일지 왼쪽에 붙일지를 이 값으로 가른다.
   * 이력·실시간 수신 모두 senderId 를 내 memberId 와 맞춰서 정한다.
   */
  isSelf: boolean;
  /**
   * 내가 보냈지만 아직 서버가 되돌려주지 않은 메시지.
   * 서버 왕복을 기다리는 동안 화면에 미리 띄우기 위한 표시이며, 브로드캐스트가 도착하면 사라진다.
   */
  pending?: boolean;
}

export interface RoomInfo {
  title: string;
  capacity: number;
}

/** POST /study-rooms/{roomId}/join 응답 */
export interface JoinRoomResponse {
  roomId: number;
  memberId: number;
  /** 스터디 기록 ID = 세션 ID. 자세 판정·progress·end 가 모두 이 값을 쓴다 */
  studyRecordId: number;
  openviduSessionId: string;
  /** OpenVidu 접속 토큰 */
  mediaToken: string;
}

/** 상세 조회 — GET /api/v1/study-rooms/{roomId} (백엔드 StudyRoomResponse와 1:1 대응) */
export interface StudyRoomDetailDto {
  roomId: number;
  hostMemberId: number;
  title: string;
  status: string; // WAITING | RUNNING | ENDED
  roomType: string;
  maxMembers: number;
  currentMembers: number;
  plannedDurationSeconds: number | null;
  focusDurationSeconds: number;
  breakDurationSeconds: number;
  stretchingEnabled: boolean;
  studyTagId: number;
  hashTags: string | null;
  isLocked: boolean;
  /**
   * 음성 녹음 방인가. 참이면 입장 전에 동의서를 거쳐야 한다.
   *
   * ⚠️ 서버가 아직 이 값을 내려주지 않아 항상 undefined 다(study_rooms 에 컬럼이 없다).
   * 그래서 지금은 어떤 방도 동의서로 가지 않는다. 자세한 요청 내용은
   * docs/backend/voice-recording.md 참고.
   */
  voiceRecordingEnabled?: boolean;
  rules: string | null;
  description: string | null;
  thumbnailImageUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  expiresAt: string | null;
  endReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 방 타이머 설정 — GET/PATCH /api/v1/study-rooms/{roomId}/timer
 *
 * DB 는 초로 저장하지만 이 API 는 분으로 주고받는다. 서버 검증이 집중 최소 1분이라
 * 초 단위 설정은 보낼 수 없다.
 */
export interface RoomTimerDto {
  roomId: number;
  focusMinutes: number;
  breakMinutes: number;
  stretchingEnabled: boolean;
  /** 조회 시에는 null */
  updatedBy: number | null;
  updatedAt: string;
}

/** 타이머 설정 변경 요청. 안 보낸 항목은 그대로 둔다. */
export interface UpdateRoomTimerRequest {
  focusMinutes?: number;
  breakMinutes?: number;
  stretchingEnabled?: boolean;
}

/** 타이머가 지금 어느 구간인지. BREAK 동안에는 순공 시간을 세지 않는다. */
export type TimerPhase = 'FOCUS' | 'BREAK' | 'STRETCHING';

/**
 * 진행 상태 — GET /api/v1/study-rooms/{roomId}/timer/state
 * 늦게 들어온 사람이 지금 몇 초 남았는지 맞추는 데 쓴다.
 */
export interface TimerStateDto {
  running: boolean;
  phase: TimerPhase | null;
  sequence: number | null;
  durationSeconds: number | null;
  remainingSeconds: number | null;
  stretchingEnabled: boolean;
}

/**
 * 페이즈 전환 브로드캐스트 — /topic/study-rooms/{roomId}/timer
 * 시작·전환·정지 때 방 전원에게 온다. 그래서 같은 방 사람 모두 같은 구간을 본다.
 */
export interface TimerPhaseEvent {
  type: 'STARTED' | 'PHASE_CHANGED' | 'STOPPED';
  roomId: number;
  phase: TimerPhase;
  sequence: number;
  durationSeconds: number;
  remainingSeconds: number;
  stretchingEnabled: boolean;
}

/** 참여자 목록 — GET /api/v1/study-rooms/{roomId}/participants */
export interface ParticipantDto {
  studyRecordId: number;
  memberId: number;
  nickname: string;
  /** 프로필 사진 주소. 안 올렸거나 탈퇴한 회원이면 없다. */
  profileImageUrl?: string | null;
  joinedAt: string;
  focusedSeconds: number;
}

/**
 * 참여자 입퇴장 실시간 이벤트 — /topic/study-rooms/{roomId}/participants
 * 서버가 입장(JOINED)·퇴장(LEFT) 시점에 방 전원에게 보낸다.
 */
export interface ParticipantEvent {
  type: 'JOINED' | 'LEFT';
  roomId: number;
  memberId: number;
  nickname: string;
  /** 이 이벤트만으로 새 참여자를 그릴 수 있도록 사진도 같이 온다. */
  profileImageUrl?: string | null;
  participantsCount: number;
}

/**
 * 미디어 상태 — /topic/study-rooms/{roomId}/media
 *
 * 누가 카메라·마이크를 껐는지, 화면 공유 중인지 타일에 표시하는 데 쓴다.
 * 입장 직후에는 GET /study-rooms/{roomId}/media-states 로 현재 상태를 한 번 받는다.
 */
export interface MediaStateEvent {
  memberId: number;
  nickname: string;
  cameraOn: boolean;
  micOn: boolean;
  screenSharing: boolean;
}

/**
 * 채팅 메시지 — /topic/study-rooms/{roomId}/messages
 *
 * DB에 저장하지 않는 실시간 전파 방식이라 입장 이후 메시지만 받는다(이력 조회 없음).
 * messageId 는 서버가 발급한 UUID 로, 화면 key 로 쓴다.
 */
export interface ChatMessageEvent {
  messageId: string;
  roomId: number;
  senderId: number;
  senderNickname: string;
  content: string;
  /** 서버 시각(LocalDateTime 문자열, 예: 2026-07-30T09:21:48) */
  sentAt: string;
}
