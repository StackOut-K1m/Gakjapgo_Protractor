// src/components/study/icons.tsx
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

export function MicIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect
        x="9"
        y="2.5"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MicOffIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M9 5a3 3 0 0 1 6 0v5.5M9 9.5V11a3 3 0 0 0 4.6 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 9.8 5.6M18.5 11v.4M12 17.5V21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M3.5 3.5l17 17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function VideoIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect
        x="2.5"
        y="6"
        width="13"
        height="12"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M15.5 11l6-3.5v9L15.5 13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ScreenShareIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect
        x="2.5"
        y="4"
        width="19"
        height="13"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8 21h8M12 13V8m0 0l-2.5 2.5M12 8l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 이전 페이지 */
export function ChevronLeftIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 다음 페이지 */
export function ChevronRightIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M9 5l7 7-7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 음성 안내 켜짐 — 스피커에서 소리가 퍼지는 모양 */
export function SpeakerIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M4 9.5h3L11 6v12l-4-3.5H4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 9.5a3.5 3.5 0 0 1 0 5M17 7a7 7 0 0 1 0 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 음성 안내 꺼짐 — 소리 물결 대신 가위표 */
export function SpeakerOffIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M4 9.5h3L11 6v12l-4-3.5H4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M15 10l5 4m0-4l-5 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 작은 창(PiP) — 큰 화면 오른쪽 아래에 작은 화면이 겹친 모양 */
export function PipIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect
        x="2.5"
        y="4.5"
        width="19"
        height="15"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="12"
        y="11.5"
        width="7.5"
        height="6"
        rx="1.2"
        fill="currentColor"
      />
    </svg>
  );
}

/** 작은 창(PiP)에서 큰 화면으로 돌아가기 — 사각형 밖으로 나가는 화살표 */
export function ReturnIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M10 4.5H5.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M14.5 3.5h6v6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 3.5 12.5 11.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TimerIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle
        cx="12"
        cy="12.5"
        r="8.2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 8v4.5l3 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SettingsIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9L5.3 5.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 오른쪽 패널(채팅·참여자)이 붙은 화면. 사이드바 접기/펼치기 버튼에 쓴다. */
export function SidebarIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect
        x="3"
        y="4.5"
        width="18"
        height="15"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M14.5 4.5v15" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** 톱니바퀴. 화면 설정(SettingsIcon)과 구분하려고 별도로 둔다. */
export function GearIcon({ size = 20 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ExitIcon({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M15 4.5h3.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H15M10 16l-4-4 4-4M6 12h9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UsersIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M16 5.4a3.2 3.2 0 0 1 0 5.4M17.5 14.4c1.9.6 3.2 2.3 3.2 4.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SendIcon({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M4 12L20 4l-3.5 16-4.5-6-8-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FlameIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M12 2.8s4.8 3.6 4.8 8.2A4.8 4.8 0 0 1 12 15.8a4.8 4.8 0 0 1-4.8-4.8C7.2 6.4 12 2.8 12 2.8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 21.2c3 0 5.4-2 5.4-4.6 0-1.3-.6-2.5-1.5-3.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WarningIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path
        d="M12 3.5l9 15.5H3l9-15.5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 9.5v4M12 16.2v.1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckCircleIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M8.2 12.3l2.6 2.6 5-5.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DisabledCircleIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M9 9l6 6M15 9l-6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
