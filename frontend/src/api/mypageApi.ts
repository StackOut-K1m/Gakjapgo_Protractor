import { api } from '@/api/client';
import { useAuthStore } from '@/stores/useAuthStore';
import type {
  MypageSummary,
  NotificationSettings,
  NotificationSettingsUpdate,
  Profile,
  ProfileUpdateRequest,
  StudyRoomPage,
} from '@/types/mypage';

/**
 * 목 데이터 스위치. 게시판(VITE_USE_MOCK_BOARD)과 같은 방식으로 <b>켜야 켜진다.</b>
 *
 * 예전에는 {@code !== 'false'} 라서 아무것도 설정하지 않으면 목이 켜져 있었다. .env.local 이
 * 없는 사람(과 배포 이미지 — Dockerfile 이 이 값을 넣지 않는다)에게는 마이페이지 숫자가
 * 통째로 가짜로 보였고, 프로필을 고쳐도 새로고침하면 되돌아갔다. 서버가 다 구현된 지금은
 * 기본값이 실제 API 여야 한다.
 *
 * 서버가 죽었을 때 잠깐 목으로 돌리려면 .env.local 에 VITE_USE_MOCK=true 를 둔다.
 */
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

// 백엔드 GET /members/me 응답 (MemberResponse)
interface MemberResponseDto {
  memberId: number;
  email: string;
  nickname: string;
  profileImageUrl?: string;
  /** LOCAL / KAKAO / GOOGLE */
  provider?: string;
  role: string;
  accountStatus: string;
  /** 가입일. 프로필 카드에 표시한다 */
  createdAt?: string;
}

// ── 목 데이터 ────────────────────────────────────────────────
const mockProfile: Profile = {
  memberId: 1,
  nickname: '테스터',
  email: 'tester@example.com',
  profileImageUrl: undefined,
  createdAt: '2026-03-01T09:00:00Z',
};

// 목 모드에서도 실제 로그인/회원가입한 회원 정보가 보이도록,
// 스토어에 회원이 있으면 그 값으로 목 프로필을 덮어쓴다.
function currentMockProfile(): Profile {
  const member = useAuthStore.getState().member;
  if (!member) return mockProfile;
  return {
    ...mockProfile,
    memberId: member.memberId,
    nickname: member.nickname,
    email: member.email,
    profileImageUrl: member.profileImageUrl ?? mockProfile.profileImageUrl,
  };
}

const mockStudyRooms: StudyRoomPage = {
  studyRooms: [
    {
      roomId: 101,
      title: '아침 6시 기상 스터디',
      category: 'CS',
      joinedAt: '2026-07-26T21:00:00Z',
      totalStudySeconds: 7200,
      totalScore: 88,
    },
    {
      roomId: 102,
      title: '알고리즘 문제풀이방',
      category: '코딩테스트',
      joinedAt: '2026-07-25T13:30:00Z',
      totalStudySeconds: 5400,
      totalScore: 79,
    },
    {
      roomId: 103,
      title: '자격증 함께 준비',
      category: '자격증',
      joinedAt: '2026-07-24T19:00:00Z',
      totalStudySeconds: 3600,
      totalScore: 92,
    },
  ],
  page: { page: 0, size: 10, totalElements: 3, totalPages: 1 },
};

const mockSummary: MypageSummary = {
  profile: mockProfile,
  activeStudyCount: 3,
  attendanceRate: 92.3,
  totalStudyTime: 462600, // 128시간 30분 = 초
  goalMinutes: 360, // 하루 6시간
  weeklyGoalMinutes: 2520, // 360 × 7
};

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// ── API 함수 ─────────────────────────────────────────────────
export async function getMypageSummary(): Promise<MypageSummary> {
  if (USE_MOCK) {
    await delay();
    return { ...mockSummary, profile: currentMockProfile() };
  }
  const { data } = await api.get<MypageSummary>('/mypage/summary');
  return data;
}

// GET /members/me — 백엔드 구현 완료. 가입일(createdAt)도 함께 온다.
export async function getProfile(): Promise<Profile> {
  const { data } = await api.get<MemberResponseDto>('/members/me');
  return {
    memberId: data.memberId,
    nickname: data.nickname,
    email: data.email,
    profileImageUrl: data.profileImageUrl,
    // 서버는 진작 내려주고 있었는데 여기서 옮겨 담지 않아 프로필 카드의 가입일이
    // 계속 비어 있었다. MemberResponse 주석에도 "가입일 표시용"이라고 적혀 있다.
    createdAt: data.createdAt,
    role: data.role,
    accountStatus: data.accountStatus,
  };
}

// ── 프로필 수정 3종 ──────────────────────────
//
// 이 셋은 목으로 대신하지 않는다. 읽기(getProfile)가 이미 실제 서버를 보고 있어서, 쓰기만
// 가짜로 두면 "바꾸면 바뀌는데 새로고침하면 되돌아가는" 상태가 된다. 특히 사진은 목이
// URL.createObjectURL 로 그 탭에만 있는 임시 주소를 돌려줘서, 저장된 것처럼 보이기까지 한다.
// 백엔드는 세 엔드포인트 모두 구현돼 있다.

export async function updateProfile(
  body: ProfileUpdateRequest,
): Promise<Profile> {
  const { data } = await api.patch<Profile>('/members/me', body);
  return data;
}

/**
 * 프로필 사진 올리기. 서버가 파일을 저장하고 새 주소를 돌려준다.
 *
 * Content-Type 은 지정하지 않는다 — client.ts 의 인터셉터가 FormData 를 보고 대신
 * 지워 준다(직접 쓰면 boundary 가 빠져 서버가 multipart 로 못 읽는다).
 */
export async function uploadProfileImage(file: File): Promise<Profile> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<Profile>('/members/me/profile-image', form);
  return data;
}

/** 프로필 사진 지우기. 기본 이미지(닉네임 첫 글자)로 돌아간다. */
export async function deleteProfileImage(): Promise<Profile> {
  const { data } = await api.delete<Profile>('/members/me/profile-image');
  return data;
}

export async function getMyStudyRooms(
  page = 0,
  size = 10,
): Promise<StudyRoomPage> {
  if (USE_MOCK) {
    await delay();
    return mockStudyRooms;
  }
  const { data } = await api.get<StudyRoomPage>('/mypage/study-rooms', {
    params: { page, size },
  });
  return data;
}

// GET /members/me/notification-settings — 백엔드 구현 완료
export async function getNotificationSettings(): Promise<NotificationSettings> {
  const { data } = await api.get<NotificationSettings>(
    '/members/me/notification-settings',
  );
  return data;
}

// PATCH /members/me/notification-settings — 보낸 항목만 수정되는 부분 수정 API
export async function updateNotificationSettings(
  body: NotificationSettingsUpdate,
): Promise<NotificationSettings> {
  const { data } = await api.patch<NotificationSettings>(
    '/members/me/notification-settings',
    body,
  );
  return data;
}

// DELETE /members/me — 일반 계정은 비밀번호 확인 필요, 소셜 계정은 본문 없이 호출
export async function withdrawMembership(
  passwordConfirm?: string,
): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>('/members/me', {
    data: passwordConfirm ? { passwordConfirm } : undefined,
  });
  return data;
}
