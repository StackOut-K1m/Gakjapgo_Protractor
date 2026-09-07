import { api } from '@/api/client';
import type { StudyRoom } from '@/types/home';
import type {
  ChatMessageEvent,
  JoinRoomResponse,
  MediaStateEvent,
  ParticipantDto,
  RoomTimerDto,
  StudyRoomDetailDto,
  TimerStateDto,
  UpdateRoomTimerRequest,
} from '@/types/room';
import type {
  CreateStudyRoomRequestDto,
  StudyRoomListResponseDto,
  StudyRoomSummaryDto,
  StudyTagDto,
} from '@/types/studyRoom';

interface StudyRoomListParams {
  status?: 'WAITING' | 'RUNNING' | 'ENDED';
  page?: number;
  size?: number;
  sort?: string;
}

// study_tags(id → 이름). 백엔드 study_tags 테이블의 고정 목록과 일치시킨다.
// 목록이 바뀌면 여기와 StudyRoomFinder·StudyListPage의 카테고리 칩을 함께 갱신한다.
export const STUDY_TAG_NAMES: Record<number, string> = {
  1: '수능',
  2: '공무원',
  3: '취업',
  4: '자격증',
  5: '어학',
  6: 'IT·개발',
  7: '독서',
  8: '자기계발',
};

/** 카테고리(태그) id → 표시 이름. 모르는 id는 '기타'. */
export function studyTagName(studyTagId: number): string {
  return STUDY_TAG_NAMES[studyTagId] ?? '기타';
}

// 백엔드 응답(StudyRoomSummary) → 화면용 StudyRoom 변환.
function toStudyRoom(dto: StudyRoomSummaryDto): StudyRoom {
  return {
    id: String(dto.roomId),
    title: dto.title,
    capacity: dto.maxMembers,
    participants: dto.currentMembers,
    category: STUDY_TAG_NAMES[dto.studyTagId] ?? '기타',
    status: dto.status,
    locked: dto.isLocked,
    // hashTags는 "#a #b" 같은 공백 구분 문자열 → 배열로. 비면 빈 배열.
    tags: dto.hashTags ? dto.hashTags.trim().split(/\s+/).filter(Boolean) : [],
    thumbnailUrl: dto.thumbnailImageUrl,
  };
}

// GET /study-rooms — 스터디룸 목록 조회
// 홈 "방 찾기"는 클라에서 카테고리·키워드로 필터하므로 여기선 목록만 받아온다.
export async function getStudyRooms(): Promise<StudyRoom[]> {
  const { data } = await api.get<StudyRoomListResponseDto>('/study-rooms', {
    params: { page: 0, size: 100, sort: 'createdAt,desc' },
  });
  return data.studyRooms.map(toStudyRoom);
}

// GET /study-rooms — 방 찾기 페이지용 원본 목록(status·createdAt 포함).
// 필터(카테고리·모집중)가 서버에 없어 한 번에 받아 화면에서 거른다. (홈과 같은 방식)
export async function getStudyRoomSummaries(
  params: StudyRoomListParams = {},
): Promise<StudyRoomSummaryDto[]> {
  const { data } = await api.get<StudyRoomListResponseDto>('/study-rooms', {
    params: { page: 0, size: 100, sort: 'createdAt,desc', ...params },
  });
  return data.studyRooms;
}

interface RecommendedStudyRoomDto {
  roomId: number;
  title: string;
  studyTagId: number;
  currentMembers: number;
  maxMembers: number;
  thumbnailImageUrl: string | null;
  recommendationReason: 'INTEREST_TAG' | 'ACTIVE_ROOM';
}

/** GET /study-rooms/recommendations — 로그인 회원의 관심 태그 기반 활성 방 추천. */
export async function getRecommendedStudyRooms(size = 3): Promise<RecommendedStudyRoomDto[]> {
  const { data } = await api.get<RecommendedStudyRoomDto[]>('/study-rooms/recommendations', {
    params: { size },
  });
  return data;
}

// GET /study-tags — 카테고리(태그) 목록. 개설 드롭다운·방찾기 필터에 사용.
export async function getStudyTags(): Promise<StudyTagDto[]> {
  const { data } = await api.get<StudyTagDto[]>('/study-tags');
  return data;
}

// POST /study-rooms — 방 개설. 응답에서 roomId만 사용한다(방장은 서버가 JWT에서 추출).
export async function createStudyRoom(
  body: CreateStudyRoomRequestDto,
): Promise<{ roomId: number }> {
  const { data } = await api.post<{ roomId: number }>('/study-rooms', body);
  return data;
}

/**
 * 현재 참여자 목록. 퇴장하지 않은 사람만 내려온다.
 *
 * 입장 직후 한 번 불러 화면을 채우고, 이후 변화는 WebSocket 이벤트로 반영한다.
 */
export async function getParticipants(
  roomId: number,
): Promise<ParticipantDto[]> {
  const { data } = await api.get<ParticipantDto[]>(
    `/study-rooms/${roomId}/participants`,
  );
  return data;
}

/**
 * 방의 최근 채팅. 새로고침·재접속했을 때 이전 대화를 이어 보여주려고 한 번 받아 온다.
 *
 * DB에 저장하지 않아 서버가 재시작되면 비어 있다(정책상 이력 보관은 안 함).
 */
export async function getRecentMessages(
  roomId: number,
): Promise<ChatMessageEvent[]> {
  const { data } = await api.get<ChatMessageEvent[]>(
    `/study-rooms/${roomId}/messages`,
  );
  return data;
}

/** 방 타이머 설정(집중·휴식 시간) 조회. */
export async function getRoomTimer(roomId: number): Promise<RoomTimerDto> {
  const { data } = await api.get<RoomTimerDto>(`/study-rooms/${roomId}/timer`);
  return data;
}

/**
 * 방 타이머 설정 변경. 방장만 가능하다(다른 사람이 부르면 403).
 * 서버 검증이 집중 최소 1분이라 그보다 짧은 값은 400 이 된다.
 */
export async function updateRoomTimer(
  roomId: number,
  request: UpdateRoomTimerRequest,
): Promise<RoomTimerDto> {
  const { data } = await api.patch<RoomTimerDto>(
    `/study-rooms/${roomId}/timer`,
    request,
  );
  return data;
}

/**
 * 타이머가 지금 어느 구간에 몇 초 남았는지. 늦게 입장했거나 새로고침했을 때 맞춘다.
 * 실행 중이 아니면 running=false 로 온다.
 */
export async function getRoomTimerState(
  roomId: number,
): Promise<TimerStateDto> {
  const { data } = await api.get<TimerStateDto>(
    `/study-rooms/${roomId}/timer/state`,
  );
  return data;
}

/** 타이머 시작(방장). 집중↔휴식 사이클이 돌기 시작한다. */
export async function startRoomTimer(roomId: number): Promise<void> {
  await api.post(`/study-rooms/${roomId}/timer/start`);
}

/** 타이머 정지(방장). */
export async function stopRoomTimer(roomId: number): Promise<void> {
  await api.post(`/study-rooms/${roomId}/timer/stop`);
}

/**
 * 방 참여자들의 미디어 상태(카메라·마이크·화면공유) 스냅샷.
 *
 * 실시간 이벤트는 구독한 뒤에 오는 것만 받으므로, 입장 직후 한 번 불러 기존 참여자 상태를 맞춘다.
 */
export async function getMediaStates(
  roomId: number,
): Promise<MediaStateEvent[]> {
  const { data } = await api.get<MediaStateEvent[]>(
    `/study-rooms/${roomId}/media-states`,
  );
  return data;
}

/**
 * 스터디룸 나가기. 현재 회원의 스터디 기록에 퇴장 시각(left_at)을 남긴다.
 *
 * 이걸 부르지 않으면 참여자 목록에 계속 남아 있는 것으로 집계된다.
 * 입장 기록이 없으면 404 를 던지므로 호출부에서 삼켜야 한다.
 */
export async function leaveRoom(roomId: number): Promise<void> {
  await api.post(`/study-rooms/${roomId}/leave`);
}

/**
 * 입장하지 않고 비밀번호만 맞는지 확인한다. 맞으면 그냥 끝나고, 틀리면 403 으로 던진다.
 *
 * 준비 화면은 별도 팝업이라 그 안에서 틀린 걸 알아도 다시 입력받을 자리가 없다. 게다가 그때는
 * 이미 카메라 권한·모델 로딩·캘리브레이션을 다 지난 뒤다. 그래서 팝업을 열기 전, 비밀번호 창이
 * 아직 떠 있을 때 여기서 먼저 걸러낸다.
 *
 * 잠금 자체는 이 함수가 담당하지 않는다. 이걸 건너뛰고 joinRoom 을 직접 부를 수 있으므로
 * 실제로 막는 곳은 서버의 입장 API 다.
 */
export async function verifyRoomPassword(
  roomId: number,
  password: string,
): Promise<void> {
  await api.post(`/study-rooms/${roomId}/verify-password`, { password });
}

/**
 * 스터디룸 입장. 스터디 기록(세션)을 만들거나 되살리고 OpenVidu 접속 토큰을 발급한다.
 *
 * 응답의 studyRecordId 가 이후 자세 판정·진행 시간 동기화·종료에서 쓰는 세션 id 다.
 *
 * 카메라/자세 사전 확인이 둘 다 true 가 아니면 서버가 400 을 낸다. 입장 준비 화면에서
 * 이미 검증한 값을 그대로 넘긴다.
 *
 * password 는 잠긴 방일 때 보낸다. 틀리거나 빠지면 서버가 403 을 낸다. 화면에서는
 * verifyRoomPassword 로 미리 걸러 주지만, 그 확인을 건너뛰고 이 API 를 직접 부를 수 있으므로
 * 실제로 막는 곳은 여기다.
 *
 * 이미 방에 있는 회원의 재호출에는 비밀번호를 묻지 않는다. 이 API 는 준비 화면·스터디룸·
 * 새로고침에서 여러 번 불린다.
 */
export async function joinRoom(
  roomId: number,
  checks: {
    cameraChecked: boolean;
    postureChecked: boolean;
    password?: string | null;
  },
): Promise<JoinRoomResponse> {
  const { cameraChecked, postureChecked, password } = checks;
  const { data } = await api.post<JoinRoomResponse>(
    `/study-rooms/${roomId}/join`,
    {
      cameraChecked,
      postureChecked,
      // 공개 방에는 필드 자체를 넣지 않는다. null 을 보내면 서버 로그에 남을 이유가 없다.
      ...(password ? { password } : {}),
    },
  );
  return data;
}

// GET /study-rooms/{roomId} — 방 상세(제목·정원·현재인원). 비로그인도 조회 가능.
export async function getStudyRoom(
  roomId: number,
): Promise<StudyRoomDetailDto> {
  const { data } = await api.get<StudyRoomDetailDto>(`/study-rooms/${roomId}`);
  return data;
}
