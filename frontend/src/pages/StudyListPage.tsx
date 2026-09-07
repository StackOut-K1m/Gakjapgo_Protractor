// src/pages/StudyListPage.tsx — 스터디 방 찾기 (목록·검색·필터·페이지네이션)
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getStudyRoomSummaries, studyTagName } from '@/api/studyRoomApi';
import { LockIcon, PlusIcon, SearchIcon } from '@/components/home/icons';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { useAsync } from '@/hooks/useAsync';
import { isRecruiting, occupancyLabel } from '@/lib/room/recruiting';
import { useAuthStore } from '@/stores/useAuthStore';
import type { StudyRoomSummaryDto } from '@/types/studyRoom';
import styles from './StudyListPage.module.css';

// 백엔드 study_tags 고정 8종 + 전체. (studyRoomApi.STUDY_TAG_NAMES와 함께 유지)
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

// 카테고리·모집중 필터가 서버에 없어 목록 전체를 받아 화면에서 거른다 → 정렬도 화면에서 한다.
const SORTS = [
  { value: 'latest', label: '최신순' },
  { value: 'title', label: '이름순' },
  { value: 'capacity', label: '정원 많은순' },
] as const;
type SortValue = (typeof SORTS)[number]['value'];

function splitTags(hashTags: string | null): string[] {
  return hashTags ? hashTags.trim().split(/\s+/).filter(Boolean) : [];
}

function RoomSearchCard({
  room,
  onOpen,
}: {
  room: StudyRoomSummaryDto;
  onOpen: () => void;
}) {
  const tags = splitTags(room.hashTags);

  return (
    <article className={styles['card']}>
      {/* 마감된 방도 상세는 볼 수 있어야 하므로 비활성화하지 않는다. */}
      <button
        type="button"
        onClick={onOpen}
        className={styles['card-thumb']}
        aria-label={`${room.title} 상세 보기`}
      >
        {room.thumbnailImageUrl && (
          <img
            src={room.thumbnailImageUrl}
            alt=""
            className={styles['card-thumb-image']}
            onError={(e) => {
              // 이미지가 깨져도 카드 레이아웃은 유지되도록 이미지만 감춘다.
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        {/* 방 상세와 같은 배지다. 카드에서 보고 들어간 사람이 같은 표시를 같은 자리에서
            다시 봐야 해서 문구·위치를 맞춰 뒀다. */}
        <span className={styles['card-badge']}>{occupancyLabel(room)}</span>
        {room.isLocked && (
          <span className={styles['card-lock']} title="비공개 방">
            <LockIcon size={14} />
            비공개
          </span>
        )}
      </button>

      <h3 className={styles['card-title']}>{room.title}</h3>
      {tags.length > 0 && (
        <p className={styles['card-tags']}>
          {tags.map((tag) => (
            <span key={tag} className={styles['card-tag']}>
              {tag}
            </span>
          ))}
        </p>
      )}
      <p className={styles['card-category']}>{studyTagName(room.studyTagId)}</p>
    </article>
  );
}

export default function StudyListPage() {
  const navigate = useNavigate();
  const member = useAuthStore((s) => s.member);
  const isLoggedIn = Boolean(member);

  const rooms = useAsync(getStudyRoomSummaries, []);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('전체');
  const [sort, setSort] = useState<SortValue>('latest');
  const [recruitingOnly, setRecruitingOnly] = useState(true);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const result = (rooms.data ?? []).filter((room) => {
      if (category !== '전체' && studyTagName(room.studyTagId) !== category) {
        return false;
      }
      if (recruitingOnly && !isRecruiting(room)) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        room.title.toLowerCase().includes(q) ||
        studyTagName(room.studyTagId).toLowerCase().includes(q) ||
        splitTags(room.hashTags).some((tag) => tag.toLowerCase().includes(q))
      );
    });

    // filter가 새 배열을 돌려주므로 제자리 정렬해도 원본은 안전하다.
    if (sort === 'title') {
      result.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    } else if (sort === 'capacity') {
      result.sort((a, b) => b.maxMembers - a.maxMembers);
    } else {
      // createdAt은 ISO 문자열이라 문자열 비교로 시간순이 맞는다.
      result.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    return result;
  }, [rooms.data, keyword, category, sort, recruitingOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // 필터가 바뀌어 페이지 수가 줄면 마지막 페이지로 당긴다.
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className={styles['page']}>
      <div className={styles['head']}>
        <div>
          <h1 className={styles['title']}>스터디 방 찾기</h1>
          <p className={styles['sub']}>
            나에게 맞는 완벽한 스터디를 찾고, 함께 몰입해보세요
          </p>
        </div>
        {/* 방 만들기는 로그인해야 쓸 수 있으므로 비로그인에는 노출하지 않는다. */}
        {isLoggedIn && (
          <button
            type="button"
            onClick={() => navigate('/study/create')}
            className={styles['create-btn']}
          >
            <PlusIcon />방 만들기
          </button>
        )}
      </div>

      <div className={styles['controls']}>
        {/* 검색창과 정렬을 한 줄에 둔다. 정렬은 오른쪽 끝. */}
        <div className={styles['search-row']}>
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
              setPage(1);
            }}
            className={styles['search-input']}
          />
          </div>

          <label className={styles['sort-field']}>
            <span className={styles['sort-label']}>정렬:</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortValue);
                setPage(1);
              }}
              className={styles['sort-select']}
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles['filter-row']}>
          <ToggleSwitch
            layout="row"
            label="모집 중만 보기"
            checked={recruitingOnly}
            onChange={(checked: boolean) => {
              setRecruitingOnly(checked);
              setPage(1);
            }}
          />
        </div>

        <div className={styles['category-chips']} role="tablist">
          {CATEGORIES.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={category === name}
              onClick={() => {
                setCategory(name);
                setPage(1);
              }}
              className={styles['category-chip']}
              data-active={category === name}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {rooms.loading && <p className={styles['state']}>불러오는 중…</p>}
      {rooms.error && (
        <p className={styles['state']}>스터디 목록을 불러오지 못했습니다.</p>
      )}
      {!rooms.loading && !rooms.error && visible.length === 0 && (
        <p className={styles['state']}>조건에 맞는 스터디 방이 없어요.</p>
      )}

      {visible.length > 0 && (
        <div className={styles['room-grid']}>
          {visible.map((room) => (
            <RoomSearchCard
              key={room.roomId}
              room={room}
              onOpen={() => navigate(`/study/${room.roomId}`)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className={styles['pagination']} aria-label="페이지 이동">
          <button
            type="button"
            className={styles['page-btn']}
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
            aria-label="이전 페이지"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={styles['page-btn']}
              data-active={n === currentPage}
              onClick={() => setPage(n)}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            className={styles['page-btn']}
            disabled={currentPage === totalPages}
            onClick={() => setPage(currentPage + 1)}
            aria-label="다음 페이지"
          >
            ›
          </button>
        </nav>
      )}
    </div>
  );
}
