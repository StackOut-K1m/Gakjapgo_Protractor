import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getPosts } from '@/api/boardApi';
import BoardPagination from '@/components/board/BoardPagination';
import PostListSection from '@/components/board/PostListSection';
import PostWriteModal from '@/components/board/PostWriteModal';
import { useAsync } from '@/hooks/useAsync';
import { BOARD_SORTS } from '@/lib/board/boardPaths';
import type { BoardSort } from '@/types/board';

import './CommunityPage.css';

/**
 * 요약 카드가 훑는 문의 수.
 *
 * 서버 목록 API 의 한 번 최대치(50)와 맞췄다. 이보다 많이 쌓인 사람에게는 카드 아래에
 * "최근 50건 기준"이라고 적는다 — 답변 완료/대기는 상태 집계 API 가 따로 없어서 목록에서 센다.
 */
const SUMMARY_SIZE = 50;

/**
 * 1:1 문의. 보호 라우트라 로그인 상태에서만 들어온다.
 * 서버가 내 문의만 돌려주고(관리자는 전체), 남의 문의는 상세에 들어가도 404가 난다.
 */
function SupportPage() {
  const navigate = useNavigate();
  // 글을 열 때 지금 주소를 넘겨, 상세에서 "목록으로" 누르면 보던 조건 그대로 돌아오게 한다.
  const location = useLocation();
  const [sort, setSort] = useState<BoardSort>('latest');
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [writeOpen, setWriteOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading, error } = useAsync(
    () =>
      getPosts({
        category: 'INQUIRY',
        keyword: search || undefined,
        sort,
        page,
        size: 6,
      }),
    [sort, search, page, refreshKey],
  );

  /**
   * 요약 카드용 전체 목록. 보고 있는 페이지(6건)로 세면 2페이지로 넘어갈 때 숫자가 바뀐다 —
   * 검색·정렬과도 무관해야 하므로 조건 없이 따로 받는다.
   */
  const summary = useAsync(
    () => getPosts({ category: 'INQUIRY', page: 0, size: SUMMARY_SIZE }),
    [refreshKey],
  );

  // 문의에 달린 댓글은 곧 답변이다. 처리 상태 컬럼이 서버에 없어 이 기준으로 센다.
  const rows = summary.data?.posts ?? [];
  const answered = rows.filter((p) => p.commentCount > 0).length;
  const waiting = rows.length - answered;
  const total = summary.data?.page.totalElements ?? 0;
  const partial = total > rows.length;

  const submitSearch = () => {
    setSearch(keyword.trim());
    setPage(0);
  };

  return (
    <div className="community">
      <header className="board-header">
        <div className="board-header-text">
          <h1>문의하기</h1>
          <p className="muted">
            궁금한 점이나 불편한 점을 남겨주세요. 문의 내용은 작성자 본인과
            관리자만 볼 수 있어요.
          </p>
        </div>
        <button
          type="button"
          className="primary write-btn"
          onClick={() => setWriteOpen(true)}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
            <path
              d="M12 5v14M5 12h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          문의 작성
        </button>
      </header>

      {/* 숫자는 목록에서 센다 — 화면에 박아 두면 실제와 어긋난다 */}
      <div className="support-kpis">
        <SupportKpi label="내 문의" value={summary.data ? `${total}건` : '-'} />
        <SupportKpi
          label="답변 완료"
          value={summary.data ? `${answered}건` : '-'}
          tone="ok"
        />
        <SupportKpi
          label="답변 대기"
          value={summary.data ? `${waiting}건` : '-'}
          tone="warn"
        />
      </div>
      {partial && (
        <p className="support-kpi-note">
          답변 완료·대기는 최근 {rows.length}건 기준입니다.
        </p>
      )}

      <div className="filter-bar">
        <div className="search-input">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <circle
              cx="11"
              cy="11"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="m20 20-3.5-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
            placeholder="제목, 내용 검색..."
            aria-label="문의 검색"
          />
        </div>
        <div className="sort-toggle" role="group" aria-label="정렬 기준">
          {BOARD_SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`sort-btn${sort === s.key ? ' active' : ''}`}
              aria-pressed={sort === s.key}
              onClick={() => {
                setSort(s.key);
                setPage(0);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <PostListSection
        posts={data?.posts ?? null}
        loading={loading}
        error={error}
        emptyText="등록한 문의가 없습니다. 궁금한 점을 남겨보세요."
        onSelect={(post) =>
          // 돌아올 곳을 같이 넘긴다. 상세의 "목록으로"가 이 주소로 되돌린다.
          navigate(`/community/posts/${post.postId}`, {
            state: { from: location.pathname + location.search },
          })
        }
      />

      {data && (
        <BoardPagination
          page={page}
          totalPages={data.page.totalPages}
          onChange={setPage}
        />
      )}

      {writeOpen && (
        <PostWriteModal
          fixedCategory="INQUIRY"
          onClose={() => setWriteOpen(false)}
          onCreated={() => {
            // 검색어만 비운다. 검색 중이면 새 글이 조건에 안 맞아 안 보인다. 정렬은 보던 대로.
            setSearch('');
            setKeyword('');
            setPage(0);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

function SupportKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}) {
  return (
    <div className="support-kpi">
      <span className="support-kpi-label">{label}</span>
      <span className="support-kpi-value" data-tone={tone}>
        {value}
      </span>
    </div>
  );
}

export default SupportPage;
