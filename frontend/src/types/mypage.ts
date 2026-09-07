// 마이페이지 관련 공용 타입 (API 명세서 기준)

// GET /members/me
export interface Profile {
  memberId: number;
  nickname: string;
  email: string;
  profileImageUrl?: string;
  /** 백엔드 MemberResponse 에는 가입일이 없어 값이 없을 수 있다. */
  createdAt?: string;
  role?: string;
  accountStatus?: string;
}

// PATCH /members/me 요청
export interface ProfileUpdateRequest {
  nickname: string;
  profileImageUrl?: string;
  tagIds?: number[];
}

// GET /mypage/stats 용 타입(DailyStat·MyStats 등)은 걷어냈다.
//
// 그 엔드포인트는 백엔드에 없었고, 프론트는 그 사실을 아는 채로 목 데이터를 돌려주고
// 있었다. 지금 학습 목표 카드는 GET /reports/me/summary 가 주는 일자별 값을 쓴다 —
// 그쪽이 임의의 주를 받아 기록에서 직접 계산해 주기 때문이다(StudyGoalsSection 참고).
// /mypage/stats 가 생기면 그때 타입을 다시 만들면 된다.

// GET /mypage/study-rooms
export interface StudyRoomSummary {
  roomId: number;
  title: string;
  category?: string;
  joinedAt: string;
  totalStudySeconds: number;
  totalScore?: number;
}

export interface StudyRoomPage {
  studyRooms: StudyRoomSummary[];
  page: {
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

// GET/PATCH /members/me/notification-settings
// GET/PATCH /members/me/notification-settings — 백엔드 알림 유형과 1:1 대응
export interface NotificationSettings {
  friendEnabled: boolean;
  dmEnabled: boolean;
  communityEnabled: boolean;
  inquiryEnabled: boolean;
  noticeEnabled: boolean;
  reportEnabled: boolean;
  rankingEnabled: boolean;
}

// PATCH 는 부분 수정 — 보낸 항목만 바뀐다.
export type NotificationSettingsUpdate = Partial<NotificationSettings>;

// GET /mypage/summary (마이페이지 상단 요약 3박스)
export interface MypageSummary {
  profile: Profile;
  activeStudyCount: number; // 참여 중인 스터디 수
  /**
   * 화면에는 '학습 집중률'로 표시한다 (0~100). 기록이 없으면 null.
   *
   * 서버 필드 이름은 attendanceRate 지만 실제 계산은
   * 순공부 시간 ÷ (총 학습 시간 − 휴식 시간) 이다. 출석 횟수와는 무관하다 —
   * 방마다 정해진 일정 개념이 없어 진짜 출석률을 낼 수 없기 때문이다.
   * 이름을 바꾸지 않는 이유는 서버 응답 키와 어긋나면 매핑이 한 겹 더 생겨서다.
   */
  attendanceRate: number | null;
  totalStudyTime: number; // 총 학습 시간 (초 단위)
  /** 하루 목표 학습 시간(분). 온보딩에서 설정한 값이며 미설정이면 null */
  goalMinutes: number | null;
  /** 주간 목표 학습 시간(분). 서버가 goalMinutes × 7 로 계산해 준다 */
  weeklyGoalMinutes: number | null;
}
