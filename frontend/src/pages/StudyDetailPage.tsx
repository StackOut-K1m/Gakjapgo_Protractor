// src/pages/StudyDetailPage.tsx — 스터디룸 상세 (소개·규칙·운영 시간·참여 멤버·참여 신청)
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import axios from 'axios';

import {
  getParticipants,
  getStudyRoom,
  studyTagName,
  verifyRoomPassword,
} from '@/api/studyRoomApi';
import { LockIcon } from '@/components/home/icons';
import ConsentRequiredDialog from '@/components/study/ConsentRequiredDialog';
import { useAsync } from '@/hooks/useAsync';
import { useDetectionConsent } from '@/hooks/useDetectionConsent';
import { isRecruiting, occupancyLabel } from '@/lib/room/recruiting';
import { toPlainLines, toPlainText } from '@/lib/text/richText';
import { useAuthStore } from '@/stores/useAuthStore';
import type { ParticipantDto, StudyRoomDetailDto } from '@/types/room';
import RoomPasswordDialog from '@/components/study/RoomPasswordDialog';
import { buildPreparationUrl, openRoomWindow } from '@/utils/openRoomWindow';
import {
  clearRoomPassword,
  readRoomPassword,
  stashRoomPassword,
} from '@/utils/roomPassword';
import styles from './StudyDetailPage.module.css';

/** 'YYYY.MM.DD' 표기. 값이 없거나 못 읽으면 null. */
function formatDate(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${mm}.${dd}`;
}

function formatMinutes(seconds: number): string {
  return `${Math.round(seconds / 60)}분`;
}

function splitTags(hashTags: string | null): string[] {
  return hashTags ? hashTags.trim().split(/\s+/).filter(Boolean) : [];
}

export default function StudyDetailPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const member = useAuthStore((s) => s.member);
  const isLoggedIn = Boolean(member);
  const [popupBlocked, setPopupBlocked] = useState(false);
  /** 감지 동의를 철회한 사용자에게 띄우는 안내 창 */
  const [consentRequired, setConsentRequired] = useState(false);
  const detectionConsent = useDetectionConsent(isLoggedIn);
  /** 비밀번호 입력 창을 띄우는 중인가 */
  const [askingPassword, setAskingPassword] = useState(false);
  /** 비밀번호 창에 띄울 거절 사유. null 이면 아직 틀린 적이 없다 */
  const [passwordError, setPasswordError] = useState<string | null>(null);
  /** 서버에 비밀번호를 확인하는 중인가. 같은 값을 두 번 보내지 않게 막는다 */
  const [checkingPassword, setCheckingPassword] = useState(false);

  const id = Number(roomId);
  const validId = Number.isInteger(id) && id > 0;

  const room = useAsync<StudyRoomDetailDto>(
    () =>
      validId
        ? getStudyRoom(id)
        : Promise.reject(new Error('잘못된 주소입니다.')),
    [id],
  );
  // 참여자 목록 API는 로그인이 필요해서(목록·상세와 달리 공개가 아님) 비로그인에서는 부르지 않는다.
  const participants = useAsync<ParticipantDto[]>(
    () =>
      isLoggedIn && validId
        ? getParticipants(id)
        : Promise.resolve([] as ParticipantDto[]),
    [id, isLoggedIn],
  );

  if (room.loading) {
    return <p className={styles['state']}>불러오는 중…</p>;
  }
  if (room.error || !room.data) {
    return (
      <div className={styles['state']}>
        <p>스터디룸을 찾을 수 없습니다.</p>
        <button
          type="button"
          className={styles['back-btn']}
          onClick={() => navigate('/study')}
        >
          목록으로 돌아가기
        </button>
      </div>
    );
  }

  const data = room.data;
  const recruiting = isRecruiting(data);
  const seatsLeft = Math.max(0, data.maxMembers - data.currentMembers);
  const tags = splitTags(data.hashTags);
  /*
   * 규칙·소개글은 서식 편집기(RichTextEditor)가 innerHTML 로 저장한다. 엔터를 치면
   * <div>줄</div> 이 쌓이므로 줄바꿈 문자로만 자르면 한 줄로 뭉치고 태그가 그대로 보인다.
   */
  const rules = toPlainLines(data.rules);
  const description = toPlainText(data.description);
  const memberList = participants.data ?? [];
  const host = memberList.find((p) => p.memberId === data.hostMemberId);

  // 누르면 심사나 승인 없이 바로 준비 화면이 열린다. '참여 신청'은 기다려야 하는 것처럼 읽혀서
  // 실제 동작과 어긋난다.
  const joinLabel =
    data.status === 'ENDED'
      ? '종료된 스터디입니다'
      : seatsLeft === 0
        ? '정원이 가득 찼습니다'
        : '입장하기 ›';

  // 백엔드엔 "가입 멤버" 개념이 없고 접속 중(퇴장 전) 기록만 있어서, 개설 시각 필드로 개설일을 보여준다.
  // 시작일·종료일과 스트레칭 가이드 여부는 빼기로 했다. 방을 고르는 데 쓰이지 않고,
  // 시작 전 방은 늘 '시작 전 / 미정'이라 칸만 차지했다.
  const timeRows = [
    { label: '학습 시간', value: formatMinutes(data.focusDurationSeconds) },
    { label: '쉬는 시간', value: formatMinutes(data.breakDurationSeconds) },
  ];

  /**
   * 입장. 거쳐야 할 관문을 순서대로 통과시킨다.
   *
   *   감지 동의 → 동의서(음성 녹음 방) → 비밀번호(잠긴 방) → 준비 화면
   *
   * 감지 동의를 맨 앞에 두는 이유는, 동의를 철회한 사용자는 어떤 방에도 들어갈 수 없어서다.
   *
   * 동의서가 비밀번호보다 먼저인 이유는, 녹음에 동의하지 않으면 그 방에는 아예 들어갈 수 없어서다.
   * 비밀번호를 먼저 받으면 동의를 거절한 사람에게 비밀번호부터 물은 꼴이 된다.
   *
   * 비밀번호를 준비 화면보다 앞에 두는 이유는, 카메라를 켜고 자세를 잡은 뒤에 되돌려
   * 보내면 그 준비가 통째로 헛수고가 되기 때문이다.
   *
   * 동의서로 갈 때는 비밀번호 단계를 그쪽에 넘긴다(VoiceConsentPage 가 이어받는다).
   */
  function handleJoin() {
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    // 감지 동의를 철회했으면 들어갈 수 없다. 철회 자체는 허용하되 그냥 넘어가지는 않는다.
    //
    // false 일 때만 막는다 — null(아직 못 읽음)에서 막으면 서버가 잠깐 느린 것만으로
    // 멀쩡한 사용자가 방에 못 들어간다. 그 구멍은 서버 join 검증이 메워야 한다
    // (docs/backend/onboarding-consent.md 3번).
    if (detectionConsent.consented === false) {
      setConsentRequired(true);
      return;
    }
    /*
      음성 녹음 방이면 동의서를 먼저 거치게 하던 관문.
      음성 녹음 기능을 감추면서 같이 막아 둔다(2026-08-03) — 동의서 경로 자체가
      router 에서 빠져 있어, 이 분기가 살아 있으면 없는 화면으로 보내게 된다.

    if (data.voiceRecordingEnabled) {
      navigate(`/study/room/${id}/consent`);
      return;
    }
    */
    // 이 창에서 이미 비밀번호를 받아 둔 방이면(방금 만들었거나 조금 전에 입력했거나)
    // 또 묻지 않는다.
    if (data.isLocked && !readRoomPassword(String(id))) {
      setAskingPassword(true);
      return;
    }
    openPreparation();
  }

  /**
   * 준비 화면 팝업을 연다.
   *
   * 카메라 권한 창(동의창)은 준비 화면이 카메라를 요청하는 순간 브라우저가 직접 띄운다 —
   * 허용 전까지는 매번 다시 묻는다.
   */
  function openPreparation() {
    const roomWindow = openRoomWindow();
    if (!roomWindow) {
      setPopupBlocked(true);
      return;
    }
    setPopupBlocked(false);
    roomWindow.location.href = buildPreparationUrl(String(id));
    roomWindow.focus();
  }

  /**
   * 비밀번호를 확인하고, 맞을 때만 방을 연다.
   *
   * 확인을 먼저 하는 이유는 창 구조 때문이다. 준비 화면은 팝업이라 그 안에서 틀린 걸 알아도
   * 다시 입력받을 자리가 없고, 저장된 값은 이 창(window.opener)에 있어 팝업이 고치지도 못한다.
   * 그래서 이 창의 비밀번호 입력 칸이 아직 떠 있을 때 걸러야 사용자가 바로 다시 칠 수 있다.
   *
   * 맞을 때만 stash 하는 것도 같은 이유다. 틀린 값을 남겨 두면 다음에 입장 버튼을 눌렀을 때
   * "값이 있으니 물을 필요 없다"고 판단해 창을 그냥 열어 버린다(아래 handleEnter 참고).
   */
  async function handlePasswordSubmit(password: string) {
    setCheckingPassword(true);
    setPasswordError(null);
    try {
      await verifyRoomPassword(id, password);
    } catch (e) {
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      setPasswordError(
        status === 403
          ? '비밀번호가 올바르지 않습니다.'
          : '비밀번호를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
      return;
    } finally {
      setCheckingPassword(false);
    }

    stashRoomPassword(String(id), password);
    setAskingPassword(false);
    openPreparation();
  }

  return (
    <div className={styles['page']}>
      <section className={styles['hero']}>
        <div className={styles['hero-inner']}>
          <div className={styles['thumb']}>
            {data.thumbnailImageUrl && (
              <img
                src={data.thumbnailImageUrl}
                alt=""
                className={styles['thumb-image']}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            {/* 목록 카드와 같은 자리(우측 상단)에 둔다. 카드에서 보고 들어온 사람이
                같은 표시를 같은 곳에서 다시 찾을 수 있어야 한다. */}
            {data.isLocked && (
              <span className={styles['thumb-lock']} title="비공개 방">
                <LockIcon size={16} />
                비공개
              </span>
            )}
            <span className={styles['thumb-badge']}>
              {occupancyLabel(data)}
            </span>
          </div>

          <div className={styles['info']}>
            <div className={styles['chips']}>
              <span className={styles['chip-category']}>
                {studyTagName(data.studyTagId)}
              </span>
              {tags.map((tag) => (
                <span key={tag} className={styles['chip-tag']}>
                  {tag}
                </span>
              ))}
            </div>
            <h1 className={styles['room-title']}>{data.title}</h1>
            <p className={styles['tagline']} data-empty={!description}>
              {description || '아직 등록된 소개가 없어요.'}
            </p>
            <div className={styles['meta']}>
              {host && (
                <span className={styles['meta-item']}>
                  <span className={styles['host-avatar']}>
                    {host.profileImageUrl ? (
                      <img src={host.profileImageUrl} alt="" />
                    ) : (
                      host.nickname.slice(0, 1)
                    )}
                  </span>
                  방장: {host.nickname}
                </span>
              )}
              <span className={styles['meta-item']}>
                개설일: {formatDate(data.createdAt) ?? '-'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className={styles['body']}>
        <section>
          <h2 className={styles['section-title']}>스터디 규칙</h2>
          {rules.length > 0 ? (
            <ul className={styles['rule-list']}>
              {rules.map((rule) => (
                <li key={rule} className={styles['rule-item']}>
                  <span className={styles['rule-check']}>✓</span>
                  {rule}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles['empty-note']}>아직 등록된 규칙이 없어요.</p>
          )}
        </section>

        <section>
          <h2 className={styles['section-title']}>운영 시간</h2>
          <ul className={styles['time-list']}>
            {timeRows.map((row) => (
              <li key={row.label} className={styles['time-row']}>
                <span className={styles['time-label']}>{row.label}</span>
                <span className={styles['time-value']}>{row.value}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className={styles['section-title']}>
            참여 중인 멤버 ({data.currentMembers} / {data.maxMembers})
          </h2>

          {/*
            지금 있는 사람과 입장 버튼을 한 줄에 둔다.
            남은 자리 수를 따로 적지 않는 이유는 (0 / 2) 가 이미 같은 말을 하기 때문이다.
          */}
          <div className={styles['member-panel']}>
            {!isLoggedIn ? (
              <p className={styles['member-empty']}>
                로그인하면 참여 중인 멤버를 볼 수 있어요.
              </p>
            ) : memberList.length === 0 ? (
              <p className={styles['member-empty']}>
                지금 접속해 있는 멤버가 없어요.
              </p>
            ) : (
              <ul className={styles['member-grid']}>
                {memberList.map((p) => (
                  <li key={p.memberId} className={styles['member']}>
                    <span
                      className={styles['member-avatar']}
                      data-host={p.memberId === data.hostMemberId}
                    >
                      {p.profileImageUrl ? (
                        <img src={p.profileImageUrl} alt="" />
                      ) : (
                        p.nickname.slice(0, 1)
                      )}
                    </span>
                    <span className={styles['member-name']}>{p.nickname}</span>
                    {p.memberId === data.hostMemberId && (
                      <span className={styles['member-role']}>방장</span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* 사람이 몇이든 버튼 자리는 오른쪽 끝에 고정된다 */}
            <button
              type="button"
              className={styles['join-btn']}
              disabled={!recruiting}
              onClick={handleJoin}
            >
              {joinLabel}
            </button>
          </div>

          {popupBlocked && (
            <p className={styles['popup-blocked']} role="alert">
              팝업이 차단되어 창을 열 수 없어요. 주소창의 팝업 차단 아이콘에서
              이 사이트를 허용한 뒤 다시 시도해 주세요.
            </p>
          )}
        </section>
      </div>

      {consentRequired && (
        <ConsentRequiredDialog
          onGoToSettings={() => navigate('/mypage')}
          onCancel={() => {
            setConsentRequired(false);
            // 다른 탭에서 다시 동의하고 왔을 수 있다. 닫을 때 한 번 더 확인해 둔다.
            detectionConsent.refresh();
          }}
        />
      )}

      {askingPassword && (
        <RoomPasswordDialog
          roomTitle={data.title}
          error={passwordError}
          submitting={checkingPassword}
          onSubmit={handlePasswordSubmit}
          onCancel={() => {
            // 취소하면 앞서 입력한 값이 남지 않게 지운다
            clearRoomPassword();
            setPasswordError(null);
            setAskingPassword(false);
          }}
        />
      )}
    </div>
  );
}
