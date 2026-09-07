import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createStudyRoom, getStudyTags } from '@/api/studyRoomApi';
import { getApiErrorMessage } from '@/api/client';
import {
  DEFAULT_STUDY_THUMBNAIL,
  STUDY_THUMBNAIL_PRESETS,
} from '@/constants/studyThumbnails';
import type { StudyTagDto } from '@/types/studyRoom';
import FormField from '../components/ui/FormField';
import SelectField from '../components/ui/SelectField';
import TagInput from '../components/ui/TagInput';
import ToggleSwitch from '../components/ui/ToggleSwitch';
import TimeToggleField from '../components/ui/TimeToggleField';
import RichTextEditor from '../components/ui/RichTextEditor';
import { openRoomWindow, buildPreparationUrl } from '../utils/openRoomWindow';
import { stashRoomPassword } from '../utils/roomPassword';
import { readVoiceGuidance, writeVoiceGuidance } from '../utils/voiceGuidance';
import styles from './CreateStudyPage.module.css';
import PageHeader from '@/components/layout/PageHeader';
// 음성 동의서 흐름에서만 쓰던 스토어. 그 흐름과 함께 감춰 둔다(2026-08-03)
// import { useRoomEntryStore } from '@/stores/useRoomEntryStore';

// 카테고리 옵션은 GET /study-tags 로 서버에서 불러온다(컴포넌트 state).

const STUDY_TIME_PRESETS = [
  { value: '25', label: '25분' },
  { value: '50', label: '50분' },
];

/** 비공개 방 비밀번호 자릿수. 서버가 형식을 검사하지 않아 화면에서 정한다. */
const PASSWORD_MIN_LENGTH = 4;
const PASSWORD_MAX_LENGTH = 8;

const BREAK_TIME_PRESETS = [
  { value: '5', label: '5분' },
  { value: '10', label: '10분' },
];

// TODO: API 연동 — 서버 제한값과 동기화 필요
const MAX_MEMBERS = 8;

interface FormState {
  studyName: string;
  category: string;
  maxMembers: string;
  hashtags: string[];
  studyTime: string;
  breakTime: string;
  voiceRecording: boolean;
  /** 자세 경고·스트레칭 알림을 목소리로도 전할지 */
  voiceGuidance: boolean;
  /** 비공개 방 여부. 켜면 비밀번호를 받는다 */
  locked: boolean;
  /** 비공개 방 입장 비밀번호. 숫자만 받는다 */
  password: string;
  rules: string;
  /** 소개글. 이미지 없이 텍스트만 받는다(썸네일은 별도 필드). */
  description: string;
  /** 방 썸네일 이미지 주소. 백엔드는 URL 문자열만 받는다(업로드 API 없음). */
  thumbnailImageUrl: string;
}

function createInitialForm(): FormState {
  return {
    studyName: '',
    category: '',
    maxMembers: '',
    // 빈 채로 시작한다. 예시 태그를 넣어 두면 지우지 않은 사람이 그대로 만들어서,
    // 내용과 상관없는 태그가 붙은 방이 쌓인다.
    hashtags: [],
    studyTime: '50',
    breakTime: '10',
    voiceRecording: true,
    // 이 사람이 마지막으로 쓰던 값에서 시작한다. 방마다 다시 고르게 하면
    // 껐던 사람이 방을 만들 때마다 다시 꺼야 한다.
    voiceGuidance: readVoiceGuidance(),
    locked: false,
    password: '',
    rules: '',
    description: '',
    // 썸네일 없는 방이 생기지 않도록 기본값을 하나 골라 둔다.
    thumbnailImageUrl: DEFAULT_STUDY_THUMBNAIL,
  };
}

// 폼 → 백엔드 요청 매핑 후 방 개설(POST /study-rooms). 응답 roomId를 문자열 id로 돌려준다(기존 흐름 호환).
// 유형/시작·종료일/음성녹음은 BE로 보내지 않는다(유형·날짜는 제거 예정, 음성녹음은 프론트 라우팅용).
async function createStudy(form: FormState): Promise<{ id: string }> {
  const created = await createStudyRoom({
    title: form.studyName,
    studyTagId: Number(form.category),
    maxMembers: Number(form.maxMembers),
    hashTags: form.hashtags.join(' '),
    focusDurationSeconds: Number(form.studyTime) * 60,
    breakDurationSeconds: Number(form.breakTime) * 60,
    rules: form.rules,
    description: form.description,
    isLocked: form.locked,
    // 음성 녹음을 감추면서 같이 뺐다(2026-08-03). 되살리려면 이 줄도 함께 되돌린다.
    //   voiceRecordingEnabled: form.voiceRecording,
    // 서버에 아직 받는 필드가 없다. 지금 실제로 동작하는 경로는 아래 writeVoiceGuidance 쪽이다.
    voiceGuidanceEnabled: form.voiceGuidance,
    // 공개 방이면 비밀번호를 보내지 않는다. 껐다 켰다 한 뒤 남은 값이 딸려 가면,
    // 공개 방인데 DB 에는 비밀번호가 박혀 있는 상태가 된다.
    password: form.locked ? form.password : undefined,
    // 빈 값은 보내지 않아 서버가 null(썸네일 없음)로 두게 한다.
    thumbnailImageUrl: form.thumbnailImageUrl.trim() || undefined,
  });

  // 응답 타입은 roomId: number 지만 axios 는 실제 값을 검사하지 않는다.
  // 서버가 null 을 주면 String(null) 이 "null" 이 되어 그대로 입장 주소에 박히고,
  // 방은 만들어지지도 않았는데 준비 화면은 정상처럼 열린다. 여기서 끊어야 실패가 드러난다.
  if (!Number.isInteger(created.roomId) || created.roomId <= 0) {
    console.error('[create] 서버 응답에 방 번호가 없습니다', created);
    throw new Error('스터디 개설에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }

  return { id: String(created.roomId) };
}

export default function CreateStudyPage() {
  const navigate = useNavigate();
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(createInitialForm);
  const [categories, setCategories] = useState<StudyTagDto[]>([]);
  /** 필수 항목 누락 안내 문구. null 이면 안 띄운다. */
  const [warning, setWarning] = useState<string | null>(null);
  // 음성 동의서로 넘길 때만 쓰던 값. 그 흐름과 함께 감춰 둔다(2026-08-03)
  // const setVoiceRoom = useRoomEntryStore((s) => s.setVoiceRoom);

  // 카테고리(study_tags) 목록 로드 → 드롭다운. 아직 미선택이면 첫 항목을 기본값으로.
  useEffect(() => {
    getStudyTags()
      .then((tags) => {
        setCategories(tags);
        if (tags.length > 0) {
          setForm((prev) =>
            prev.category
              ? prev
              : { ...prev, category: String(tags[0].studyTagId) },
          );
        }
      })
      .catch(() => setCategories([]));
  }, []);

  function patch(partial: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  /**
   * 방금 만든 비공개 방의 비밀번호를 입장 흐름에 넘겨 둔다.
   *
   * 이게 없으면 방을 만든 사람이 몇 초 전에 직접 정한 비밀번호를 다시 입력해야 한다.
   * 값은 이 창의 메모리에만 있고 창을 닫으면 사라진다(utils/roomPassword 참고).
   */
  function rememberOwnPassword(roomId: string) {
    if (form.locked && form.password) {
      stashRoomPassword(roomId, form.password);
    }
  }

  /**
   * 필수 항목 검사. 비어 있으면 띄울 문구를 돌려주고, 문제없으면 null.
   * 둘 다 비었을 때는 개별 항목 대신 전체 안내를 보여준다.
   */
  function findMissingRequired(): string | null {
    const noTitle = form.studyName.trim() === '';
    const noMembers = form.maxMembers.trim() === '';

    if (noTitle && noMembers) return '필수 항목 확인 후 작성해 주세요';
    if (noTitle) return '스터디명을 작성해 주세요';
    if (noMembers) return '모집 인원을 작성해 주세요';
    // 비공개로 해놓고 비밀번호를 비우면 아무나 들어오는 방이 된다. 서버가 막아 주지 않으므로 여기서 막는다.
    if (form.locked && form.password.length < PASSWORD_MIN_LENGTH) {
      return `비밀번호를 ${PASSWORD_MIN_LENGTH}자리 이상 입력해 주세요`;
    }
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    // 필수 항목이 비었으면 개설을 진행하지 않고 안내창만 띄운다.
    const missing = findMissingRequired();
    if (missing) {
      setWarning(missing);
      return;
    }

    // 여기 고른 값이 실제로 동작하는 유일한 경로다 — 서버가 아직 이 설정을 저장하지 않아,
    // 스터디방은 이 브라우저에 남은 값을 읽어 시작한다(utils/voiceGuidance 참고).
    // 두 갈래(동의서 / 팝업) 어느 쪽으로 가든 지나도록 분기 앞에 둔다.
    writeVoiceGuidance(form.voiceGuidance);

    /*
      음성 녹음 ON — 팝업 대신 동의서 페이지로 먼저 보낸다.
      음성 녹음 기능을 감추면서 같이 막아 둔다(2026-08-03). 되살리는 순서는
      위 ToggleSwitch 주석 참고.

    if (form.voiceRecording) {
      setSubmitting(true);
      try {
        const created = await createStudy(form);
        rememberOwnPassword(created.id);
        setVoiceRoom(created.id);
        navigate(`/study/room/${created.id}/consent`);
      } catch (e) {
        setWarning(getApiErrorMessage(e, '스터디 개설에 실패했습니다.'));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    */

    // 개설 후 준비 화면 팝업으로 바로 보낸다
    const roomWindow = openRoomWindow();
    if (!roomWindow) {
      setPopupBlocked(true);
      return;
    }
    setPopupBlocked(false);
    setSubmitting(true);

    try {
      const created = await createStudy(form);
      rememberOwnPassword(created.id);
      roomWindow.location.href = buildPreparationUrl(created.id);
      roomWindow.focus();
    } catch (e) {
      roomWindow.close();
      setWarning(getApiErrorMessage(e, '스터디 개설에 실패했습니다.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles['create-study-page']}>
      {warning && (
        <div
          className={styles['warning-overlay']}
          onClick={() => setWarning(null)}
        >
          <div
            className={styles['warning-modal']}
            role="alertdialog"
            aria-modal="true"
            aria-label={warning}
            onClick={(e) => e.stopPropagation()}
          >
            <p className={styles['warning-message']}>{warning}</p>
            <button
              type="button"
              autoFocus
              onClick={() => setWarning(null)}
              className={styles['warning-confirm-btn']}
            >
              확인
            </button>
          </div>
        </div>
      )}

      <PageHeader
        breadcrumb="홈 > 스터디 개설하기"
        title="새로운 스터디 개설하기"
        description="팀원들의 의지를 묶어줄 멋진 스터디 룰과 소개글을 상세히 기재해 주세요."
      />

      <main className={styles['create-study-main']}>
        <form onSubmit={handleSubmit} className={styles['form-body']}>
          <div className={styles['left-form-column']}>
            <FormField
              id="study-name"
              label="스터디명"
              required
              placeholder="예: [매일인증] 코딩테스트 핵심 실전 2기"
              value={form.studyName}
              onChange={(v) => patch({ studyName: v })}
            />

            <div className={styles['form-row-3col']}>
              <SelectField
                id="study-category"
                label="카테고리"
                options={categories.map((t) => ({
                  value: String(t.studyTagId),
                  label: t.name,
                }))}
                value={form.category}
                onChange={(v) => patch({ category: v })}
              />
              <div className={styles['member-count-field']}>
                <div className={styles['member-label-row']}>
                  <label
                    htmlFor="max-members"
                    className={styles['member-label']}
                  >
                    모집 인원 (명)
                  </label>
                  <span className={styles['required-mark']} aria-hidden>
                    *
                  </span>
                </div>
                <input
                  id="max-members"
                  type="number"
                  min={1}
                  max={MAX_MEMBERS}
                  value={form.maxMembers}
                  placeholder={`최대 ${MAX_MEMBERS}명`}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (Number(v) > MAX_MEMBERS) return;
                    patch({ maxMembers: v });
                  }}
                  className={styles['member-input']}
                />
              </div>
            </div>

            <TagInput
              tags={form.hashtags}
              onChange={(tags) => patch({ hashtags: tags })}
            />

            <div className={styles['form-row-2col']}>
              <TimeToggleField
                id="study-time"
                label="학습 시간"
                presets={STUDY_TIME_PRESETS}
                value={form.studyTime}
                onChange={(v) => patch({ studyTime: v })}
              />
              <TimeToggleField
                id="break-time"
                label="쉬는 시간"
                presets={BREAK_TIME_PRESETS}
                value={form.breakTime}
                onChange={(v) => patch({ breakTime: v })}
              />
            </div>

            {/*
              음성 녹음 — 쓰지 않기로 해서 감춰 둔다(2026-08-03).
              이 토글이 켜져 있으면 개설 후 음성 동의서(VoiceConsentPage)로 넘어갔다.
              토글과 동의서를 함께 감췄으므로 되살릴 때도 같이 되돌려야 한다:
                1) 아래 주석 해제
                2) handleSubmit 의 '음성 녹음 ON' 분기 주석 해제
                3) createStudy 의 voiceRecordingEnabled 주석 해제
                4) router/index.tsx 의 consent 경로 주석 해제
                5) StudyDetailPage.handleJoin 의 동의서 관문 주석 해제

            <ToggleSwitch
              label="음성 녹음"
              description="활성화 시 스터디 세션 중 음성 녹화 기능을 사용할 수 있으며, AI 회의록이 자동 생성됩니다."
              checked={form.voiceRecording}
              onChange={(v) => patch({ voiceRecording: v })}
            />
            */}

            <ToggleSwitch
              label="음성 안내"
              description="자세 경고와 스트레칭 알림을 목소리로도 알려줍니다. 화면을 보고 있지 않을 때 놓치지 않습니다. 스터디방에서 언제든 껐다 켤 수 있습니다."
              checked={form.voiceGuidance}
              onChange={(v) => patch({ voiceGuidance: v })}
            />

            <div className={styles['lock-field']}>
              <ToggleSwitch
                label="비공개 방"
                description="비밀번호를 아는 사람만 입장할 수 있습니다. 목록에는 자물쇠 표시와 함께 계속 보입니다."
                checked={form.locked}
                onChange={(v) =>
                  // 끌 때 비밀번호도 같이 지운다. 남겨 두면 화면에는 안 보이는 값이 계속 붙어 다닌다.
                  patch(v ? { locked: true } : { locked: false, password: '' })
                }
              />

              {form.locked && (
                <div className={styles['password-row']}>
                  <label
                    htmlFor="room-password"
                    className={styles['password-label']}
                  >
                    입장 비밀번호
                  </label>
                  <input
                    id="room-password"
                    // 숫자 키패드를 띄우되 앞자리 0 이 사라지지 않게 text 로 받는다.
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form.password}
                    placeholder={`숫자 ${PASSWORD_MIN_LENGTH}~${PASSWORD_MAX_LENGTH}자리`}
                    onChange={(e) =>
                      patch({
                        password: e.target.value
                          .replace(/\D/g, '')
                          .slice(0, PASSWORD_MAX_LENGTH),
                      })
                    }
                    className={styles['password-input']}
                  />
                </div>
              )}
            </div>

            <div className={styles['rules-field']}>
              <label htmlFor="study-rules" className={styles['rules-label']}>
                스터디 주요 규칙
              </label>
              <textarea
                id="study-rules"
                value={form.rules}
                placeholder="예: 매일 밤 11시까지 백준 1문제 풀이 기록을 게시판에 스크린샷으로 공유해야 출석 인정 처리됩니다."
                rows={5}
                onChange={(e) => patch({ rules: e.target.value })}
                className={styles['rules-textarea']}
              />
            </div>
          </div>

          <div className={styles['right-form-column']}>
            <div className={styles['rules-field']}>
              <span className={styles['rules-label']}>스터디방 썸네일</span>
              <p className={styles['thumbnail-hint']}>
                방 목록 카드에 표시될 이미지를 골라주세요.
              </p>

              <ul className={styles['thumbnail-grid']}>
                {STUDY_THUMBNAIL_PRESETS.map((preset) => (
                  <li key={preset.url}>
                    <button
                      type="button"
                      onClick={() => patch({ thumbnailImageUrl: preset.url })}
                      aria-pressed={form.thumbnailImageUrl === preset.url}
                      className={styles['thumbnail-option']}
                      data-selected={form.thumbnailImageUrl === preset.url}
                    >
                      <img src={preset.url} alt="" />
                      <span>{preset.label}</span>
                    </button>
                  </li>
                ))}
              </ul>

              {form.thumbnailImageUrl.trim() !== '' && (
                <div className={styles['thumbnail-preview']}>
                  <img
                    src={form.thumbnailImageUrl}
                    alt="썸네일 미리보기"
                    onError={(e) => {
                      // 잘못된 주소면 미리보기를 감춘다. 개설 자체를 막지는 않는다.
                      e.currentTarget.style.display = 'none';
                    }}
                    onLoad={(e) => {
                      e.currentTarget.style.display = '';
                    }}
                  />
                </div>
              )}
            </div>

            <RichTextEditor
              label="스터디 소개글 작성"
              placeholder={
                '스터디원들의 가입 의사결정을 도와줄 수 있는 모임의 매력과 목표를 편안하게 설명해 주세요.\n\n예: 어떤 수준의 사람들이 어울리는지, 스터디를 시작하게 된 계기 등...'
              }
              onChange={(html) => patch({ description: html })}
            />

            {popupBlocked && (
              <p className={styles['popup-blocked']} role="alert">
                팝업이 차단되어 스터디룸 창을 열 수 없습니다. 주소창 오른쪽의
                팝업 차단 아이콘에서 이 사이트를 허용한 뒤 다시 시도해 주세요.
              </p>
            )}

            <div className={styles['form-actions']}>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className={styles['cancel-btn']}
              >
                취소
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={styles['submit-btn']}
              >
                {submitting ? '개설 중...' : '개설하기'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
