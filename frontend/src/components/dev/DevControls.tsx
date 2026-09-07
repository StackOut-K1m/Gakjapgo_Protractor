// src/components/dev/DevControls.tsx
import { useEffect, useState } from 'react';
import { getPostureDetectors } from '@/api/postureApi';
import type { CoachingMode } from '@/types/coaching';
import type { PostureDetectorInfo } from '@/types/posture';
import type { Severity } from '@/types/posture-highlight';
import styles from './DevControls.module.css';

/**
 * 개발용 상태 전환 패널.
 * 팝업 창은 주소창을 수정할 수 없어 URL 쿼리 대신 이 패널로 상태를 바꾼다.
 * 프로덕션 빌드에서는 렌더링되지 않는다.
 */

const COACH_MODES: { value: CoachingMode | null; label: string }[] = [
  { value: null, label: '정상' },
  { value: 'posture', label: '자세' },
  { value: 'environment', label: '조명' },
  { value: 'camera-quality', label: '렌즈' },
  { value: 'landmark', label: '랜드마크' },
];

const SEVERITIES: { value: Severity | null; label: string }[] = [
  { value: null, label: '없음' },
  { value: 'mild', label: '경미' },
  { value: 'moderate', label: '중간' },
  { value: 'severe', label: '심각' },
];

export interface DevState {
  coachMode: CoachingMode | null;
  severity: Severity | null;
  /**
   * 켜면 다른 참여자들이 "나에게 친구 신청을 보낸" 상태로 보인다.
   * 친구 API 가 없어서 받은 요청을 실제로 만들 수 없기 때문에, 참여자 메뉴의
   * '친구 수락' 분기를 눈으로 확인하려고 둔다. 이미 친구인 사람은 그대로 둔다.
   */
  incomingFriendRequests: boolean;
  /**
   * 서버에 요청할 자세 판정 방식. null 이면 서버 기본값을 쓴다.
   *
   * 방식별 정확도를 같은 사람·같은 자세에서 비교하려고 둔 값이다. 예전에는 설정을 바꾸고
   * 서버를 다시 띄워야 해서 조건을 맞출 수 없었다.
   */
  detector: string | null;
}

interface DevControlsProps {
  state: DevState;
  onChange: (next: DevState) => void;
  /** 서버 자세 판정 상태 한 줄. 전송이 돌고 있는지 눈으로 확인하려고 둔다 */
  postureStatus?: string;
  /** 서버가 마지막 프레임을 실제로 판정한 방식. 선택이 반영됐는지 확인용 */
  activeDetector?: string | null;
}

export default function DevControls({
  state,
  onChange,
  postureStatus,
  activeDetector,
}: DevControlsProps) {
  // 화면을 가리지 않도록 접힌 상태로 시작한다. 필요할 때 펼쳐서 쓴다.
  const [collapsed, setCollapsed] = useState(true);

  /**
   * 고를 수 있는 판정 방식. 목록을 여기 적지 않고 서버에서 받는다.
   *
   * 몇 가지를 시도하게 될지 아직 정해지지 않아서, 이미지 학습 같은 방식이 추가돼도
   * 이 파일을 고치지 않도록 서버가 키·설명까지 내려주는 구조로 뒀다.
   */
  const [detectors, setDetectors] = useState<PostureDetectorInfo[]>([]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let alive = true;
    getPostureDetectors()
      .then((list) => {
        if (alive) setDetectors(list);
      })
      .catch((e) => {
        // 목록을 못 받아도 판정 자체는 서버 기본값으로 계속 돈다. 화면을 막지 않는다.
        console.warn('[dev] 판정기 목록을 받지 못했습니다', e);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!import.meta.env.DEV) return null;

  function patch(partial: Partial<DevState>) {
    onChange({ ...state, ...partial });
  }

  return (
    <aside className={styles['dev-panel']} data-collapsed={collapsed}>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className={styles['dev-toggle']}
      >
        DEV {collapsed ? '▲' : '▼'}
      </button>

      {!collapsed && (
        <div className={styles['dev-body']}>
          <div className={styles['dev-row']}>
            <span className={styles['dev-label']}>코칭</span>
            <div className={styles['dev-chips']}>
              {COACH_MODES.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => patch({ coachMode: m.value })}
                  className={styles['dev-chip']}
                  data-active={state.coachMode === m.value}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles['dev-row']}>
            <span className={styles['dev-label']}>심각도</span>
            <div className={styles['dev-chips']}>
              {SEVERITIES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => patch({ severity: s.value })}
                  className={styles['dev-chip']}
                  data-active={state.severity === s.value}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles['dev-row']}>
            <span className={styles['dev-label']}>받은 친구요청</span>
            <div className={styles['dev-chips']}>
              <button
                type="button"
                onClick={() =>
                  patch({
                    incomingFriendRequests: !state.incomingFriendRequests,
                  })
                }
                className={styles['dev-chip']}
                data-active={state.incomingFriendRequests}
              >
                {state.incomingFriendRequests ? '켬' : '끔'}
              </button>
            </div>
          </div>

          {/* 스트레칭은 컨트롤바의 부위별 감지 버튼으로 띄운다 (실제 판정이 돌아간다) */}

          {detectors.length > 0 && (
            <div className={styles['dev-row']}>
              <span className={styles['dev-label']}>판정 방식</span>
              <div className={styles['dev-chips']}>
                <button
                  type="button"
                  onClick={() => patch({ detector: null })}
                  className={styles['dev-chip']}
                  data-active={state.detector === null}
                  title="서버 application.yml 의 app.posture.detector 값을 따른다"
                >
                  기본값
                </button>
                {detectors.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => patch({ detector: d.key })}
                    className={styles['dev-chip']}
                    // 서버가 지금 이 방식으로 판정 중이면 표시한다. 요청과 응답이
                    // 어긋나면(400 등) 여기서 바로 드러난다.
                    data-active={state.detector === d.key}
                    title={d.description}
                  >
                    {d.key}
                    {d.isDefault && ' ★'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeDetector && (
            <div className={styles['dev-row']}>
              <span className={styles['dev-label']}>판정 중</span>
              <span className={styles['dev-status']}>{activeDetector}</span>
            </div>
          )}

          {postureStatus && (
            <div className={styles['dev-row']}>
              <span className={styles['dev-label']}>서버 판정</span>
              <span className={styles['dev-status']}>{postureStatus}</span>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
