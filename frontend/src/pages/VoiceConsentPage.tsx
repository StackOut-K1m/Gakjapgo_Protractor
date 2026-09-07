import { useCallback, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { getStudyRoom } from '@/api/studyRoomApi';
import RoomPasswordDialog from '@/components/study/RoomPasswordDialog';
import { useAsync } from '@/hooks/useAsync';
import { useRoomEntryStore } from '@/stores/useRoomEntryStore';
import { openRoomWindow, buildPreparationUrl } from '@/utils/openRoomWindow';
import {
  clearRoomPassword,
  readRoomPassword,
  stashRoomPassword,
} from '@/utils/roomPassword';
import styles from './VoiceConsentPage.module.css';
const CONSENT_ITEMS = [
  { id: 'recording', required: true, label: '음성 녹음 및 저장에 동의합니다' },
  { id: 'aiSummary', required: true, label: 'AI 회의록 요약을 위한 음성 데이터 처리에 동의합니다' },
  { id: 'improvement', required: false, label: '서비스 품질 개선을 위한 데이터 활용에 동의합니다' },
] as const;

type ConsentId = (typeof CONSENT_ITEMS)[number]['id'];

export default function VoiceConsentPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const voiceRoomId = useRoomEntryStore((s) => s.voiceRoomId);
  const clearEntry = useRoomEntryStore((s) => s.clear);
  const [popupBlocked, setPopupBlocked] = useState(false);
  /**
   * 동의를 마치고 스터디룸 창을 띄웠는지.
   *
   * 동의 후 스토어를 비우면 아래 접근 가드가 다시 걸려서 개설 화면으로 튕긴다.
   * 이 값이 참인 동안에는 가드를 건너뛰고 홈으로 나가게 둔다.
   */
  const [done, setDone] = useState(false);

  /** 동의를 마친 뒤 비밀번호를 묻는 중인가. 잠긴 방일 때만 켜진다 */
  const [askingPassword, setAskingPassword] = useState(false);

  const [checked, setChecked] = useState<Record<ConsentId, boolean>>({
    recording: false,
    aiSummary: false,
    improvement: false,
  });

  /**
   * 방 정보. 잠긴 방인지 알아야 동의 후 비밀번호를 물을 수 있다.
   *
   * 개설자는 방금 만든 방이라 이미 알지만, 목록에서 들어온 참여자는 여기서 처음 본다.
   */
  const numericRoomId = Number(roomId);
  const validId = Number.isInteger(numericRoomId) && numericRoomId > 0;
  const room = useAsync(
    useCallback(
      () => (validId ? getStudyRoom(numericRoomId) : Promise.resolve(null)),
      [validId, numericRoomId],
    ),
  );

  const allRequiredChecked = useMemo(
    () => CONSENT_ITEMS.filter((i) => i.required).every((i) => checked[i.id]),
    [checked],
  );
  const allChecked = CONSENT_ITEMS.every((i) => checked[i.id]);

  // 훅은 조건 없이 모두 실행돼야 하므로 아래 판단들은 훅 선언 뒤에 둔다.

  if (!validId) {
    return <Navigate to="/" replace />;
  }

  /**
   * 이 화면을 볼 자격.
   *
   * 예전에는 "방금 이 방을 만든 사람"만 통과시켰다(voiceRoomId 는 개설자 탭에만 있는 값).
   * 그래서 목록에서 들어온 참여자는 동의서 대신 개설 화면으로 튕겨 나갔다.
   * 이제 방이 음성 녹음 방이면 누구나 통과한다.
   */
  const isCreatorFlow = voiceRoomId === roomId;
  const needsConsent = room.data?.voiceRecordingEnabled === true;

  if (!room.loading && !isCreatorFlow && !needsConsent && !done) {
    // 음성 녹음 방이 아니면 동의받을 것이 없다. 상세로 돌려보낸다.
    return <Navigate to={`/study/${roomId}`} replace />;
  }

  const toggleAll = () => {
    const next = !allChecked;
    setChecked({ recording: next, aiSummary: next, improvement: next });
  };

  const toggleOne = (id: ConsentId) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /** 준비 화면 팝업을 열고 이 창은 홈으로 보낸다. 동의(→비밀번호)를 다 통과한 뒤에만 부른다. */
  const openPreparation = () => {
    if (!roomId) return;
    const roomWindow = openRoomWindow();
    if (!roomWindow) {
      setPopupBlocked(true);
      return;
    }
    setPopupBlocked(false);
    roomWindow.location.href = buildPreparationUrl(roomId);
    roomWindow.focus();

    // 스터디룸은 팝업에서 진행되므로 이 창은 동의서에 머물 이유가 없다. 홈으로 보낸다.
    // 팝업은 별도 창이라 스토어를 공유하지 않는다(입장 상태는 그쪽에서 다시 만든다).
    setDone(true);
    clearEntry();
    navigate('/', { replace: true });
  };

  const handleAgree = () => {
    if (!allRequiredChecked || !roomId) return;
    // TODO: API 연동 — 선택 항목(improvement) 동의 여부 서버 전달

    // 잠긴 방이면 비밀번호가 다음 관문이다. 동의 → 비밀번호 → 준비 화면 순서다.
    // 방을 방금 만든 사람은 이미 값을 들고 와서 다시 묻지 않는다.
    if (room.data?.isLocked && !readRoomPassword(roomId)) {
      setAskingPassword(true);
      return;
    }
    openPreparation();
  };

  const handlePasswordSubmit = (password: string) => {
    if (!roomId) return;
    stashRoomPassword(roomId, password);
    setAskingPassword(false);
    openPreparation();
  };

  /**
   * 동의하지 않으면 이 방에는 못 들어간다.
   *
   * 개설자는 방금 만든 방이라 개설 화면으로, 참여자는 보고 있던 방 상세로 돌려보낸다.
   * 참여자를 개설 화면으로 보내면 갑자기 방을 만들라는 화면이 뜬다.
   */
  const handleDecline = () => {
    navigate(isCreatorFlow ? '/study/create' : `/study/${roomId}`, {
      replace: true,
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
       <h1 className={styles.title}>
          <span aria-hidden>🎙️</span>
          음성 녹음 및 AI 활용 동의
        </h1>
        <p className={styles.lead}>
          회의형 스터디는 AI 회의록 정리를 위해 스터디 세션 중 참여자의 음성이 녹음됩니다.
          아래 내용을 확인하고 동의해 주세요.
        </p>

        <dl className={styles.infoBox}>
          <div className={styles.infoRow}>
            <dt>수집 항목</dt>
            <dd>스터디 세션 중 음성 녹음 데이터</dd>
          </div>
          <div className={styles.infoRow}>
            <dt>이용 목적</dt>
            <dd>AI 회의록 요약 · 정리 및 스터디원 공유</dd>
          </div>
          <div className={styles.infoRow}>
            <dt>보관 기간</dt>
            <dd>요약 생성 후 7일 이내 원본 자동 삭제</dd>
          </div>
        </dl>

        <label className={`${styles.allAgree} ${allChecked ? styles.allAgreeOn : ''}`}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={allChecked}
            onChange={toggleAll}
          />
          <span className={styles.allAgreeText}>전체 동의하기</span>
        </label>

        <ul className={styles.itemList}>
          {CONSENT_ITEMS.map((item) => (
            <li key={item.id}>
              <label className={styles.item}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={checked[item.id]}
                  onChange={() => toggleOne(item.id)}
                />
                <span className={item.required ? styles.tagRequired : styles.tagOptional}>
                  [{item.required ? '필수' : '선택'}]
                </span>
                <span className={styles.itemLabel}>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>

        <p className={styles.notice}>
          ⓘ 녹음 중에는 모든 참여자 화면에 녹음 표시가 노출됩니다. 필수 항목에 동의하지 않으면
          해당 스터디에 참여할 수 없습니다.
        </p>

         {popupBlocked && (
          <p className={styles.popupBlocked} role="alert">
            팝업이 차단되어 스터디룸 창을 열 수 없습니다. 주소창 오른쪽의 팝업 차단
            아이콘에서 이 사이트를 허용한 뒤 다시 시도해 주세요.
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={handleDecline}>
            동의하지 않음
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!allRequiredChecked}
            onClick={handleAgree}
          >
            동의하고 계속하기
          </button>
        </div>
      </div>

      {askingPassword && room.data && (
        <RoomPasswordDialog
          roomTitle={room.data.title}
          onSubmit={handlePasswordSubmit}
          onCancel={() => {
            // 취소하면 앞서 입력한 값이 남지 않게 지운다. 동의는 그대로 두고 여기 머문다.
            clearRoomPassword();
            setAskingPassword(false);
          }}
        />
      )}
    </div>
  );
}