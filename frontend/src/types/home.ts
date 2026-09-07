// src/types/home.ts

/**
 * 홈 상단 카드에 띄우는 D-day. 캘린더에서 "D-day 표시하기"를 켠 일정 중 가장 가까운 것이다.
 *
 * 날짜 차이가 아니라 문구를 받는 이유는 당일과 지난 날짜 때문이다. 숫자만 받으면 화면이
 * 'D-' 를 붙일 수밖에 없어서 당일이 'D-0' 으로 나온다.
 */
export interface ExamCountdown {
  /** 원본 일정 id. 카드가 여러 장 돌아갈 때 목록 key 로 쓴다. */
  id: number;
  badge: string;
  title: string;
  /** 'D-42' | 'D-DAY' */
  dDayText: string;
  message: string;
}

export interface TodayProgress {
  studiedMinutes: number;
  goalMinutes: number;
}

/**
 * 홈 상단 카드에 보여줄 요약.
 *
 * 아직 못 받은 값은 0 으로 채운다. 그럴듯한 기본 숫자를 두면 새로고침할 때마다 그 값이 스쳐
 * 지나가서 사용자가 자기 기록이 바뀐 줄 안다. 0 은 기록이 없는 신규 사용자가 실제로 보게 될
 * 화면과 같아서, 잘못 읽혀도 사실과 크게 다르지 않다.
 */
export interface HomeSummary {
  userName: string;
  onlineCount: number;
  streakDays: number;
  streakNote: string;
  weeklyStudyText: string;
  weeklyStudyNote: string;
}

export interface RecommendedRoom {
  id: string;
  title: string;
  meta: string;
}

export interface StudyRoom {
  id: string;
  title: string;
  category: string;
  participants: number;
  capacity: number;
  /** WAITING | RUNNING | ENDED. 카드의 '모집 중 / 마감' 판단에 쓴다. */
  status: string;
  locked: boolean;
  tags: string[];
  /** 방 대표 이미지. 개설 시 고른 기본 썸네일 경로이며, 없으면 null */
  thumbnailUrl: string | null;
}

export interface Notice {
  id: string;
  category: string;
  title: string;
  author: string;
  /** 서버가 준 작성 시각(ISO). 홈에서 날짜와 NEW 배지 판단에 쓴다. */
  createdAt: string;
}

export interface EventItem {
  id: string;
  title: string;
  description: string;
  /** 서버가 준 작성 시각(ISO). 최근 7일 여부와 날짜 표시에 쓴다. */
  createdAt: string;
}

export interface RankingEntry {
  rank: number;
  userName: string;
  studyTime: string;
}