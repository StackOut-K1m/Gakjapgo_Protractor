// src/components/friend/icons.tsx
// 친구 독에서 쓰는 아이콘. 다른 도메인(study·home)과 같은 방식으로 24 viewBox · currentColor 다.
interface IconProps {
  size?: number;
}

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    'aria-hidden': true,
  } as const;
}

/** 사람 둘 — 패널 제목과 접힌 원형 버튼에 쓴다 */
export function UsersIcon({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c2.1.6 3.5 2.2 3.5 4.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SearchIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle
        cx="10.5"
        cy="10.5"
        r="6.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M15.5 15.5 21 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 프로필 조회 */
export function UserCheckIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9.5" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 20c0-3.3 2.9-5.5 6.5-5.5 1.2 0 2.3.2 3.2.7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m15 15.5 2.2 2.2L21.5 13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 친구 추가 — 친구 찾기 창을 여는 버튼 */
export function UserPlusIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9.5" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 20c0-3.3 2.9-5.5 6.5-5.5 1.1 0 2.1.2 3 .6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M18.5 12.5v7M15 16h7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 친구 삭제 */
export function UserMinusIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9.5" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3 20c0-3.3 2.9-5.5 6.5-5.5 1.1 0 2.1.2 3 .6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15 16h7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** DM 전송 */
export function MessageCircleIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M21 11.5c0 4.4-4 8-9 8-1.2 0-2.3-.2-3.3-.6L4 20.5l1.3-3.6A7.5 7.5 0 0 1 3 11.5c0-4.4 4-8 9-8s9 3.6 9 8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 메시지 보내기 */
export function SendIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M4 12 20.5 4l-6 16.5-3-7.5-7.5-1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 목록 새로 받기 */
export function RefreshIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M20 12a8 8 0 1 1-2.6-5.9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 3.5V8h-4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 패널 접기 */
export function CollapseIcon({ size = 14 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="m10 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
