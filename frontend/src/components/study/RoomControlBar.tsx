// src/components/study/RoomControlBar.tsx
import { useState } from 'react';

import SettingsMenu from './SettingsMenu';
import type { SettingsMenuItem } from './SettingsMenu';
import {
  GearIcon,
  MicIcon,
  MicOffIcon,
  PipIcon,
  ScreenShareIcon,
  SettingsIcon,
  SidebarIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  VideoIcon,
} from './icons';
import { DETECT_PART_LABEL, DETECT_PART_ORDER } from '@/types/stretching';
import type { TargetPart } from '@/types/stretching';
import {
  BACKGROUND_EFFECT_LABEL,
  BACKGROUND_EFFECT_ORDER,
} from '@/utils/backgroundEffect';
import type { BackgroundEffect } from '@/utils/backgroundEffect';
import styles from './RoomControlBar.module.css';

interface RoomControlBarProps {
  micOn: boolean;
  cameraOn: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  /** 화면 공유 중 여부 */
  screenSharing?: boolean;
  /** 화면 공유 시작/중지. 없으면 버튼이 비활성화된다(화상 연결 전). */
  onToggleScreenShare?: () => void;
  /** 부위별 누적 감지 횟수. 서버가 지속을 확정할 때마다 1씩 오른다 */
  detectCounts: Record<TargetPart, number>;
  /** 이 횟수에 도달하면 스트레칭이 시작된다 */
  detectThreshold: number;
  /** 지금 경고 중인(아직 해소되지 않은) 부위 */
  activeParts: TargetPart[];
  /** 자세 판정이 돌지 않는 이유. null 이면 정상 동작 중 */
  detectionPaused: string | null;
  /** 자세 경고·스트레칭 알림을 목소리로도 전할지 */
  voiceGuidanceOn?: boolean;
  /** 음성 안내 켜기/끄기. 없으면 버튼이 비활성화된다(미지원 브라우저) */
  onToggleVoiceGuidance?: () => void;
  /** 작은 창(PiP)으로 보고 있는지 */
  pipOn?: boolean;
  /** PiP 열기/닫기. 없으면 버튼이 비활성화된다(미지원 브라우저·스트레칭 중) */
  onTogglePip?: () => void;
  /** 버튼을 누를 수 없는 이유. 툴팁으로 보여준다 */
  pipDisabledReason?: string;
  /** 지금 걸려 있는 배경 효과 */
  backgroundEffect?: BackgroundEffect;
  /** 배경 효과 변경. 없으면 화면 설정 버튼이 비활성화된다 */
  onChangeBackgroundEffect?: (effect: BackgroundEffect) => void;
  /** 화면 설정을 쓸 수 없는 이유. 툴팁으로 보여준다 */
  backgroundEffectDisabledReason?: string;
  /** 채팅·참여자 사이드바가 펼쳐져 있는지 */
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  /**
   * 설정 버튼을 눌렀을 때 띄울 메뉴 항목. 비어 있으면 버튼이 비활성화된다.
   * 지금은 방장에게만 항목이 있다(학습·쉬는 시간 변경, 타이머 시작·정지).
   */
  settingsItems?: SettingsMenuItem[];
}

export default function RoomControlBar({
  micOn,
  cameraOn,
  onToggleMic,
  onToggleCamera,
  screenSharing = false,
  onToggleScreenShare,
  detectCounts,
  detectThreshold,
  activeParts,
  detectionPaused,
  voiceGuidanceOn = false,
  onToggleVoiceGuidance,
  pipOn = false,
  onTogglePip,
  pipDisabledReason,
  backgroundEffect = 'off',
  onChangeBackgroundEffect,
  backgroundEffectDisabledReason,
  sidebarOpen,
  onToggleSidebar,
  settingsItems = [],
}: RoomControlBarProps) {
  /** 설정 메뉴를 띄울 기준 버튼. null 이면 닫힌 상태다. */
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(
    null,
  );
  /** 화면 설정 메뉴의 기준 버튼. 설정 메뉴와 따로 둔다 — 서로 다른 버튼에서 열린다. */
  const [screenAnchor, setScreenAnchor] = useState<HTMLElement | null>(null);

  return (
    <footer className={styles['control-bar']}>
      <div className={styles['control-info']}>

        {/* 부위별 누적 경고 횟수. 서버가 지속을 확정할 때마다 1 오르고,
            임계치에 닿으면 그 부위 스트레칭이 시작된다.
            읽기 전용이다 — 카운트를 올리는 주체는 서버뿐이다.
            지금 자세가 어떤지(신호등)는 영상 위 PostureLights 가 보여준다 */}
        <span className={styles['detect-group']}>
          {detectionPaused ? (
            <span className={styles['detect-chip']} data-paused="true">
              자세 감지 중지 — {detectionPaused}
            </span>
          ) : (
            DETECT_PART_ORDER.map((part) => (
              <span
                key={part}
                className={styles['detect-chip']}
                data-active={activeParts.includes(part)}
              >
                {DETECT_PART_LABEL[part]} {detectCounts[part]}/{detectThreshold}
              </span>
            ))
          )}
        </span>
      </div>

      <div className={styles['control-center']}>
        <button
          type="button"
          onClick={onToggleMic}
          className={styles['control-btn']}
          data-off={!micOn}
        >
          <span className={styles['control-icon']}>
            {micOn ? <MicIcon /> : <MicOffIcon />}
          </span>
          {micOn ? '음소거' : '음소거 해제'}
        </button>

        <button
          type="button"
          onClick={onToggleCamera}
          className={styles['control-btn']}
          data-off={!cameraOn}
        >
          <span className={styles['control-icon']}>
            <VideoIcon />
          </span>
          {cameraOn ? '비디오 끄기' : '비디오 켜기'}
        </button>

        <button
          type="button"
          onClick={onToggleScreenShare}
          disabled={!onToggleScreenShare}
          // 화상 연결이 없으면 공유할 통로 자체가 없다(송출 트랙을 바꾸는 기능이라
          // publisher 가 필요하다). 이유 없이 회색이면 고장으로 읽힌다.
          title={
            onToggleScreenShare
              ? undefined
              : '화상 서버에 연결되지 않아 화면 공유를 쓸 수 없습니다'
          }
          className={styles['control-btn']}
          data-active={screenSharing}
          aria-pressed={screenSharing}
        >
          <span className={styles['control-icon']}>
            <ScreenShareIcon />
          </span>
          {screenSharing ? '공유 중지' : '화면 공유'}
        </button>

        {/* 음성 안내. 화면을 안 보고 있을 때를 위한 통로라, 작은 창과 나란히 둔다.
            꺼진 상태를 빨갛게 칠하지 않는다 — 마이크·카메라와 달리 꺼져 있다고 해서
            남에게 영향이 가거나 기록이 빠지는 일이 없다. */}
        <button
          type="button"
          onClick={onToggleVoiceGuidance}
          disabled={!onToggleVoiceGuidance}
          title={
            onToggleVoiceGuidance
              ? undefined
              : '이 브라우저는 음성 안내를 지원하지 않습니다'
          }
          className={styles['control-btn']}
          data-active={voiceGuidanceOn}
          aria-pressed={voiceGuidanceOn}
        >
          <span className={styles['control-icon']}>
            {voiceGuidanceOn ? <SpeakerIcon /> : <SpeakerOffIcon />}
          </span>
          {voiceGuidanceOn ? '음성 안내 끄기' : '음성 안내'}
        </button>

        {/* 작은 창(PiP). 다른 일을 하는 동안에도 내 카메라와 자세 경고를 계속 볼 수 있다.
            여는 데는 사용자 제스처가 필요해서, 자동 전환이 막히면 여기서 직접 켠다. */}
        <button
          type="button"
          onClick={onTogglePip}
          disabled={!onTogglePip}
          title={pipDisabledReason}
          className={styles['control-btn']}
          data-active={pipOn}
          aria-pressed={pipOn}
        >
          <span className={styles['control-icon']}>
            <PipIcon />
          </span>
          {pipOn ? '작은 창 끄기' : '작은 창'}
        </button>

        {/* 화면 설정— 지금은 배경 효과 하나뿐이다. 카메라·마이크와 달리 상대가 보는
            그림을 바꾸는 설정이라, 켜 두면 버튼에도 그렇게 표시한다. */}
        <button
          type="button"
          onClick={(e) =>
            setScreenAnchor((prev) => (prev ? null : e.currentTarget))
          }
          disabled={!onChangeBackgroundEffect}
          title={
            onChangeBackgroundEffect
              ? undefined
              : backgroundEffectDisabledReason
          }
          className={styles['control-btn']}
          data-active={screenAnchor !== null || backgroundEffect !== 'off'}
          aria-haspopup="menu"
          aria-expanded={screenAnchor !== null}
        >
          <span className={styles['control-icon']}>
            <SettingsIcon />
          </span>
          화면 설정
        </button>
      </div>

      <div className={styles['control-side']} data-align="end">
        <button
          type="button"
          onClick={onToggleSidebar}
          className={styles['control-btn']}
          data-active={sidebarOpen}
          aria-pressed={sidebarOpen}
        >
          <span className={styles['control-icon']}>
            <SidebarIcon />
          </span>
          {sidebarOpen ? '채팅 숨기기' : '채팅 열기'}
        </button>

        <button
          type="button"
          // 지금은 방장에게만 항목이 있다. 눌러도 빈 메뉴가 뜨면 고장으로 보이므로 막아 둔다.
          disabled={settingsItems.length === 0}
          onClick={(e) =>
            setSettingsAnchor((prev) => (prev ? null : e.currentTarget))
          }
          className={styles['control-btn']}
          data-active={settingsAnchor !== null}
          aria-haspopup="menu"
          aria-expanded={settingsAnchor !== null}
        >
          <span className={styles['control-icon']}>
            <GearIcon />
          </span>
          설정
        </button>
      </div>

      {screenAnchor && onChangeBackgroundEffect && (
        <SettingsMenu
          anchor={screenAnchor}
          items={BACKGROUND_EFFECT_ORDER.map((option) => ({
            id: option,
            label: BACKGROUND_EFFECT_LABEL[option],
            selected: option === backgroundEffect,
            onSelect: () => {
              setScreenAnchor(null);
              onChangeBackgroundEffect(option);
            },
          }))}
          onClose={() => setScreenAnchor(null)}
        />
      )}

      {settingsAnchor && (
        <SettingsMenu
          anchor={settingsAnchor}
          items={settingsItems.map((item) => ({
            ...item,
            // 무엇을 고르든 메뉴는 닫는다. 항목마다 닫기를 챙기지 않아도 되게 여기서 감싼다.
            onSelect: () => {
              setSettingsAnchor(null);
              item.onSelect();
            },
          }))}
          onClose={() => setSettingsAnchor(null)}
        />
      )}
    </footer>
  );
}
