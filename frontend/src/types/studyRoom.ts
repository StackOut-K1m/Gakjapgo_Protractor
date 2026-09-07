// src/types/studyRoom.ts
// 백엔드 스터디룸 API 응답 타입 (GET /api/v1/study-rooms)

/** 목록 아이템 — 백엔드 StudyRoomSummary 와 1:1 대응 */
export interface StudyRoomSummaryDto {
  roomId: number;
  title: string;
  status: string; // WAITING | RUNNING | ENDED
  roomType: string;
  maxMembers: number;
  currentMembers: number;
  stretchingEnabled: boolean;
  studyTagId: number; // 카테고리 (study_tags FK)
  hashTags: string | null; // 자유 해시태그 (공백 구분 문자열)
  isLocked: boolean;
  thumbnailImageUrl: string | null;
  createdAt: string;
}

/** 목록 응답 — 백엔드 StudyRoomListResponse 와 1:1 대응 */
export interface StudyRoomListResponseDto {
  studyRooms: StudyRoomSummaryDto[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** 카테고리(태그) — GET /api/v1/study-tags */
export interface StudyTagDto {
  studyTagId: number;
  name: string;
}

/** 방 개설 요청 — POST /api/v1/study-rooms */
export interface CreateStudyRoomRequestDto {
  title: string;
  studyTagId: number;
  maxMembers: number;
  hashTags?: string;
  focusDurationSeconds: number;
  breakDurationSeconds: number;
  rules?: string;
  description?: string;
  /** 비공개(비밀번호) 방 여부. 미지정 시 서버가 false 로 둔다. */
  isLocked?: boolean;
  /**
   * 음성 녹음 방 여부.
   *
   * ⚠️ 서버에 아직 받는 필드가 없어 그냥 버려진다(Jackson 기본 설정이 모르는 필드를 무시한다).
   * 컬럼이 생기면 이 값이 그대로 저장된다. docs/backend/voice-recording.md 참고.
   */
  voiceRecordingEnabled?: boolean;
  /**
   * 자세 경고·스트레칭 알림을 목소리로도 전할지.
   *
   * ⚠️ voiceRecordingEnabled 와 같은 처지다 — 서버에 받는 필드가 없어 지금은 버려진다.
   * 그래서 방 만들기에서 고른 값은 만든 사람의 브라우저에만 남고 다른 참여자에게는
   * 전달되지 않는다. docs/backend/voice-guidance.md 참고.
   */
  voiceGuidanceEnabled?: boolean;
  /**
   * 비공개 방 입장 비밀번호. 255자 이하.
   *
   * ⚠️ 서버는 이 값을 저장만 하고 입장 시 검사하지 않는다(StudyRoomService.join 참고).
   * 검증이 붙기 전까지는 잠긴 방도 비밀번호 없이 입장된다.
   */
  password?: string;
  /** 방 썸네일 이미지 URL. 1000자 이하. 업로드 API가 없어 주소만 받는다. */
  thumbnailImageUrl?: string;
}
