// src/components/home/StudyRoomFinder.tsx
import { useMemo, useState } from 'react';
import type { StudyRoom } from '@/types/home';
import RoomCard from './RoomCard';
import { PlusIcon, SearchIcon } from './icons';
import styles from './StudyRoomFinder.module.css';

// 백엔드 study_tags 목록과 일치. (studyRoomApi.ts의 STUDY_TAG_NAMES와 함께 유지)
const CATEGORIES = [
  '전체',
  '수능',
  '공무원',
  '취업',
  '자격증',
  '어학',
  'IT·개발',
  '독서',
  '자기계발',
];

const PAGE_SIZE = 20;

/** 비로그인 사용자에게 미리 보여줄 방 개수. 더 보려면 로그인해야 한다. */
const GUEST_PAGE_SIZE = 10;

interface StudyRoomFinderProps {
  rooms: StudyRoom[];
  isLoggedIn: boolean;
  onCreateRoom: () => void;
  onEnterRoom: (roomId: string) => void;
  /** 비로그인 사용자가 더 보기를 눌렀을 때 (로그인 페이지로 보낸다) */
  onRequireLogin: () => void;
}

export default function StudyRoomFinder({
  rooms,
  isLoggedIn,
  onCreateRoom,
  onEnterRoom,
  onRequireLogin,
}: StudyRoomFinderProps) {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('전체');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rooms.filter((room) => {
      const matchCategory = category === '전체' || room.category === category;
      if (!matchCategory) return false;
      if (!q) return true;
      return (
        room.title.toLowerCase().includes(q) ||
        room.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [rooms, keyword, category]);

  // 비로그인은 더보기로 늘릴 수 없으므로 항상 GUEST_PAGE_SIZE 까지만 본다.
  const limit = isLoggedIn ? visibleCount : GUEST_PAGE_SIZE;
  const visible = filtered.slice(0, limit);
  const hasMore = limit < filtered.length;

  function handleCategoryChange(next: string) {
    setCategory(next);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <section className={styles['finder']}>
      <div className={styles['finder-head']}>
        <div className={styles['finder-heading']}>
          <h2 className={styles['finder-title']}>
            나에게 딱 맞는 스터디 방을 찾아보세요
          </h2>
          <p className={styles['finder-sub']}>
            나와 같은 관심사를 가진 스터디방을 찾아드립니다.
          </p>
        </div>
        {/* 방 만들기는 로그인해야 쓸 수 있으므로 비로그인에는 노출하지 않는다. */}
        {isLoggedIn && (
          <button
            type="button"
            onClick={onCreateRoom}
            className={styles['create-btn']}
          >
            <PlusIcon />방 만들기
          </button>
        )}
      </div>

      <div className={styles['finder-controls']}>
        <div className={styles['search-box']}>
          <span className={styles['search-icon']}>
            <SearchIcon />
          </span>
          <input
            type="search"
            value={keyword}
            placeholder="스터디명, 핵심 카테고리, 태그 등으로 검색해 보세요..."
            aria-label="스터디방 검색"
            onChange={(e) => {
              setKeyword(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            className={styles['search-input']}
          />
        </div>

        <div className={styles['category-chips']} role="tablist">
          {CATEGORIES.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={category === name}
              onClick={() => handleCategoryChange(name)}
              className={styles['category-chip']}
              data-active={category === name}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {visible.length > 0 && (
        <div className={styles['room-grid']}>
          {visible.map((room) => (
            <RoomCard key={room.id} room={room} onEnter={onEnterRoom} />
          ))}
        </div>
      )}

      {/* 로그인은 가릴 방이 남았을 때만, 비로그인은 방이 하나라도 있으면 로그인을 유도한다. */}
      {isLoggedIn
        ? hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className={styles['more-btn']}
            >
              <PlusIcon />
              더보기
            </button>
          )
        : filtered.length > 0 && (
            <button
              type="button"
              onClick={onRequireLogin}
              className={styles['more-btn']}
            >
              로그인 후 더 많은 스터디 방을 확인하세요
            </button>
          )}
    </section>
  );
}