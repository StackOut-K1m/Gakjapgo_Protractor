import { useEffect, useRef, useState } from 'react';

import {
  deleteProfileImage,
  getProfile,
  updateProfile,
  uploadProfileImage,
} from '@/api/mypageApi';
import SectionCard from '@/components/mypage/SectionCard';
import { useAsync } from '@/hooks/useAsync';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Profile } from '@/types/mypage';

/** 서버가 받아 주는 형식. input 의 accept 와 아래 검사에 같은 값을 쓴다. */
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * 편집 중 고른 사진. 아직 서버에 올리지 않은 상태다.
 *
 * previewUrl 은 createObjectURL 로 만든 임시 주소라, 다 쓰면 revoke 해야 메모리에서
 * 풀린다. file 을 들고 있는 이유는 '저장'을 누를 때 그때 올리기 때문이다.
 */
interface PhotoDraft {
  file: File;
  previewUrl: string;
}

function ProfileSection() {
  const { data: profile, loading, error, setData } = useAsync(getProfile, []);
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState('');
  const [photoDraft, setPhotoDraft] = useState<PhotoDraft | null>(null);
  /** '사진 제거'를 눌렀는지. 저장할 때 비로소 서버에 반영한다. */
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 미리보기 주소는 브라우저가 알아서 정리해 주지 않는다. 새 사진으로 바뀌거나
  // 이 카드가 사라질 때 직접 놓아 준다.
  useEffect(() => {
    const url = photoDraft?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoDraft]);

  /**
   * 바뀐 프로필을 화면과 전역 상태에 함께 반영한다.
   *
   * 헤더가 같은 값을 따로 들고 있어서, 여기만 바꾸면 사진을 바꿔도 헤더는 옛 사진을 그대로
   * 보여 준다. 가입일은 GET /members/me 응답에 없으므로 처음 받은 값을 지켜 준다.
   */
  const applyUpdated = (updated: Profile) => {
    setData({ ...updated, createdAt: profile?.createdAt ?? updated.createdAt });
    const store = useAuthStore.getState();
    if (store.member) {
      useAuthStore.setState({
        member: {
          ...store.member,
          nickname: updated.nickname,
          profileImageUrl: updated.profileImageUrl,
        },
      });
    }
  };

  /** 고르는 중이던 사진을 버린다. 편집을 시작하거나 끝낼 때 부른다. */
  const resetPhotoDraft = () => {
    setPhotoDraft(null);
    setPhotoRemoved(false);
  };

  const startEdit = () => {
    if (!profile) return;
    setNickname(profile.nickname);
    resetPhotoDraft();
    setSavedMsg('');
    setEditing(true);
  };

  const cancelEdit = () => {
    resetPhotoDraft();
    setEditing(false);
  };

  /**
   * 고른 사진은 여기서 올리지 않는다. 미리보기만 잡아 두고 '저장'을 누를 때 올린다.
   *
   * 즉시 올리면 편집을 취소해도 이미 바뀐 뒤라 되돌릴 수 없고, 서버에는 쓰지 않을 파일이
   * 남는다. 저장 전까지 아무것도 보내지 않으면 두 문제가 같이 사라진다.
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 같은 파일을 다시 골라도 change 가 뜨도록 값을 비운다.
    e.target.value = '';
    if (!file) return;

    // 서버도 같은 크기로 자르지만, 5MB를 다 올려 보내고 나서 거절당할 이유가 없다.
    if (file.size > MAX_IMAGE_BYTES) {
      setSavedMsg('이미지는 5MB 이하만 올릴 수 있습니다.');
      return;
    }
    setSavedMsg('');
    setPhotoRemoved(false);
    setPhotoDraft({ file, previewUrl: URL.createObjectURL(file) });
  };

  const handleRemovePhoto = () => {
    setSavedMsg('');
    setPhotoDraft(null);
    setPhotoRemoved(true);
  };

  /**
   * 닉네임과 사진을 함께 반영한다.
   *
   * 사진을 먼저 처리하는 이유는, 사진에서 실패하면 닉네임까지 저장해 놓고 "실패했습니다"를
   * 띄우는 어긋난 상태를 피하기 위해서다. 두 호출 모두 갱신된 프로필을 돌려주므로 마지막
   * 응답만 화면에 반영하면 된다.
   */
  const handleSave = async () => {
    if (!nickname.trim()) return;
    setSaving(true);
    try {
      if (photoDraft) {
        await uploadProfileImage(photoDraft.file);
      } else if (photoRemoved) {
        await deleteProfileImage();
      }
      applyUpdated(await updateProfile({ nickname: nickname.trim() }));
      resetPhotoDraft();
      setEditing(false);
      setSavedMsg('저장되었습니다.');
    } catch (e) {
      setSavedMsg(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <SectionCard title="프로필">
        <p className="muted">불러오는 중…</p>
      </SectionCard>
    );
  if (error || !profile)
    return (
      <SectionCard title="프로필">
        <p className="error">{error ?? '프로필을 불러오지 못했습니다.'}</p>
      </SectionCard>
    );

  // 편집 중에는 고른 사진을, 지우기를 눌렀으면 아무것도 안 보여 준다.
  const shownImage = photoDraft
    ? photoDraft.previewUrl
    : photoRemoved
      ? null
      : profile.profileImageUrl;

  return (
    <SectionCard
      title="프로필"
      // 편집/저장·취소를 모두 제목 줄 오른쪽에 둔다. 한쪽은 위, 한쪽은 카드 아래에 두면
      // 편집을 누르는 순간 조작 버튼이 화면 반대편으로 튄다.
      actions={
        editing ? (
          <div className="section-actions">
            <button
              type="button"
              className="primary"
              disabled={saving || !nickname.trim()}
              onClick={handleSave}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button type="button" onClick={cancelEdit} disabled={saving}>
              취소
            </button>
          </div>
        ) : (
          <button type="button" onClick={startEdit}>
            편집
          </button>
        )
      }
    >
      <div className="profile-row">
        <div className="profile-photo">
          <div className="avatar" aria-hidden>
            {shownImage ? (
              <img src={shownImage} alt="" />
            ) : (
              <span>{profile.nickname.slice(0, 1)}</span>
            )}
          </div>

          {editing && (
            <div className="profile-photo-actions">
              {/* 파일 입력은 브라우저마다 생김새가 제각각이라 숨기고 버튼으로 대신 연다 */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                onChange={handleFileChange}
                hidden
              />
              <button
                type="button"
                disabled={saving}
                onClick={() => fileInputRef.current?.click()}
              >
                변경
              </button>
              {shownImage && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleRemovePhoto}
                >
                  제거
                </button>
              )}
            </div>
          )}
        </div>

        {!editing ? (
          <div className="profile-info">
            <p className="profile-nickname">{profile.nickname}</p>
            {profile.email && <p className="muted">{profile.email}</p>}
            {/* 백엔드 GET /members/me 응답에 가입일이 없으면 표시하지 않는다. */}
            {profile.createdAt && (
              <p className="muted small">가입일 {profile.createdAt.slice(0, 10)}</p>
            )}
          </div>
        ) : (
          <div className="profile-form">
            <label>
              닉네임
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={50}
              />
            </label>
            <p className="muted small">
              사진은 jpg · png · webp · gif, 5MB 이하까지 올릴 수 있어요.
              {(photoDraft || photoRemoved) && ' 저장을 눌러야 반영돼요.'}
            </p>
          </div>
        )}
      </div>
      {savedMsg && <p className="saved-msg">{savedMsg}</p>}
    </SectionCard>
  );
}

export default ProfileSection;
