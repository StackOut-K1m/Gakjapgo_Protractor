import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { getPostCounts, getPosts } from '@/api/boardApi';
import BoardPagination from '@/components/board/BoardPagination';
import PostListSection from '@/components/board/PostListSection';
import PostWriteModal from '@/components/board/PostWriteModal';
import { useAsync } from '@/hooks/useAsync';
import {
  ADMIN_ONLY_BOARDS,
  BOARD_SORTS,
  BOARD_TABS,
  buildListSearch,
  parseListSearch,
  pathOfTab,
  tabOfPath,
} from '@/lib/board/boardPaths';
import { useAuthStore, useIsLoggedIn } from '@/stores/useAuthStore';
import type { BoardCategory, BoardSort } from '@/types/board';

import './CommunityPage.css';

/** 사이드바 인기 글 개수 */
const HOT_SIZE = 5;

function CommunityPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isLoggedIn = useIsLoggedIn();
  const isAdmin = useAuthStore((s) => s.member?.role) === 'ADMIN';
  const [searchParams] = useSearchParams();

  // 어느 게시판을 어떤 조건으로 보고 있는지는 화면 상태가 아니라 주소가 정본이다.
  // 상태로만 들고 있으면 새로고침·뒤로가기·링크 공유에서 전부 처음으로 돌아간다.
  const tab = tabOfPath(pathname);
  const { sort, page, search } = parseListSearch(searchParams);

  const [keyword, setKeyword] = useState(search); // 입력 중인 값. Enter 전까지는 주소에 안 싣는다
  const [writeOpen, setWriteOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading, error } = useAsync(
    () =>
      getPosts({
        category: tab === 'ALL' ? undefined : tab,
        keyword: search || undefined,
        sort,
        page,
        size: 6,
      }),
    [tab, sort, search, page, refreshKey],
  );

  // 탭 옆 숫자. 탭·정렬을 바꿀 때마다 다시 부를 이유가 없어 글이 새로 올라올 때만 갱신한다.
  const counts = useAsync(() => getPostCounts(), [refreshKey]);

  /**
   * 사이드바 인기 글. 조회수 상위 5개를 따로 받는다.
   *
   * 지금 보고 있는 목록에서 고르면 탭·검색·페이지에 따라 내용이 바뀌어 "인기 글"이 아니라
   * "이 페이지에서 조회수 높은 글"이 된다.
   */
  const hot = useAsync(
    () => getPosts({ sort: 'views', page: 0, size: HOT_SIZE }),
    [refreshKey],
  );

  /** 지금 보고 있는 목록의 주소. 글을 열 때 넘겨서 "목록으로"가 여기로 되돌아오게 한다. */
  const listUrl = pathname + buildListSearch({ sort, page, search });

  /** 보기 조건만 바꿔 같은 게시판에 머문다. 넘기지 않은 값은 지금 값을 그대로 쓴다. */
  const applyView = (
    next: Partial<{ sort: BoardSort; page: number; search: string }>,
  ) => {
    navigate(pathname + buildListSearch({ sort, page, search, ...next }));
  };

  const changeTab = (next: BoardCategory | 'ALL') => {
    if (next === tab) return;
    // 게시판을 옮기면 페이지는 처음으로. 정렬·검색어는 보던 대로 들고 간다.
    navigate(pathOfTab(next) + buildListSearch({ sort, page: 0, search }));
  };

  const changeSort = (next: BoardSort) => applyView({ sort: next, page: 0 });
  const submitSearch = () => applyView({ search: keyword.trim(), page: 0 });

  /**
   * 여기서 글을 쓰면 올라갈 게시판. 모달에서 따로 고르지 않고 지금 보고 있는 탭을 따른다.
   *
   * '전체 게시글' 탭에는 대응하는 게시판이 없어서 자유게시판으로 보낸다 — 어디로 가는지는
   * 모달이 한 줄로 알려 준다.
   */
  const writeCategory: BoardCategory = tab === 'ALL' ? 'FREE' : tab;

  /**
   * 공지사항·이벤트는 관리자만 쓸 수 있다(서버가 403 으로 막는다). 못 쓸 사람에게는
   * 버튼을 감춘다 — 목록은 글쓰기 모달과 같은 것을 본다(ADMIN_ONLY_BOARDS).
   */
  const canWrite = !ADMIN_ONLY_BOARDS.includes(writeCategory) || isAdmin;

  const openWrite = () => {
    // 글쓰기는 로그인 필수. 모달을 열고 401을 받느니 바로 로그인으로 보낸다.
    if (!isLoggedIn) {
      navigate('/login');
      return;
    }
    setWriteOpen(true);
  };

  return (
    <div className="community">
      <header className="board-header">
        <div className="board-header-text">
          <h1>스터디 통합 게시판</h1>
          <p className="muted">
            학습 팀원들과 유용한 지식을 공유하고 질문을 남겨 답변을 받아보세요.
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            className="primary write-btn"
            onClick={openWrite}
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
            글쓰기
          </button>
        )}
      </header>

      {/* 카테고리 탭 */}
      <nav className="board-tabs" aria-label="게시판 카테고리">
        {BOARD_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`board-tab${tab === t.key ? ' active' : ''}`}
            data-cat={t.key}
            onClick={() => changeTab(t.key)}
          >
            <span className="board-tab-dot" aria-hidden />
            {t.label}
            {/* 숫자를 아직 못 받았으면 자리만 비운다 — 0 을 먼저 보여주면 글이 없는 것처럼 보인다 */}
            {counts.data && (
              <span className="board-tab-count">
                {counts.data[t.key] ?? 0}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* 검색 + 정렬 */}
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
            placeholder="제목, 내용, 작성자 검색..."
            aria-label="게시글 검색"
          />
        </div>
        <div className="sort-toggle" role="group" aria-label="정렬 기준">
          {BOARD_SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`sort-btn${sort === s.key ? ' active' : ''}`}
              aria-pressed={sort === s.key}
              onClick={() => changeSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="board-body">
        <div className="board-main">
          <PostListSection
            posts={data?.posts ?? null}
            loading={loading}
            error={error}
            emptyText="게시글이 없습니다."
            variant="cards"
            onSelect={(post) =>
              navigate(`/community/posts/${post.postId}`, {
                state: { from: listUrl },
              })
            }
          />

          {/* 페이지 수는 서버가 전체 글 수에서 계산해 준다 — 화면이 따로 세지 않는다 */}
          {data && (
            <BoardPagination
              page={page}
              totalPages={data.page.totalPages}
              onChange={(next) => applyView({ page: next })}
            />
          )}
        </div>

        <aside className="board-side">
          <section className="side-card">
            <h2 className="side-title">인기 글</h2>
            <p className="side-note">조회수 기준 상위 {HOT_SIZE}개</p>
            {hot.data && hot.data.posts.length > 0 ? (
              <ol className="hot-list">
                {hot.data.posts.map((post, i) => (
                  <li key={post.postId}>
                    <button
                      type="button"
                      className="hot-item"
                      onClick={() =>
                        navigate(`/community/posts/${post.postId}`, {
                          state: { from: listUrl },
                        })
                      }
                    >
                      <span className="hot-rank" data-top={i === 0}>
                        {i + 1}
                      </span>
                      <span className="hot-text">
                        <span className="hot-title">{post.title}</span>
                        <span className="hot-meta" data-cat={post.category}>
                          <span className="hot-cat">
                            {BOARD_TABS.find((t) => t.key === post.category)
                              ?.label ?? post.category}
                          </span>
                          <span>댓글 {post.commentCount}</span>
                          <span>조회 {post.viewCount.toLocaleString()}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="side-empty">아직 올라온 글이 없습니다.</p>
            )}
          </section>

          <section className="side-rules">
            <span className="side-rules-kicker">BOARD RULES</span>
            <p>
              질문에는 시도한 방법을 함께 적어주세요. 자료공유 글은 출처를
              남겨주시면 좋습니다. 공지사항·이벤트는 운영자만 작성할 수 있어요.
            </p>
          </section>
        </aside>
      </div>

      {/* 글쓰기 모달 */}
      {writeOpen && (
        <PostWriteModal
          fixedCategory={writeCategory}
          onClose={() => setWriteOpen(false)}
          onCreated={(category) => {
            // 방금 쓴 글이 보이는 곳에 남는다. 다른 게시판을 골라 썼으면 그쪽으로 따라간다.
            // 검색어는 비운다 — 검색 중이면 새 글이 조건에 안 맞아 안 보인다. 정렬은 그대로.
            setKeyword('');
            navigate(
              (category === tab ? pathname : pathOfTab(category)) +
                buildListSearch({ sort, page: 0, search: '' }),
            );
            setRefreshKey((k) => k + 1); // 같은 조건이어도 목록 재조회
          }}
        />
      )}
    </div>
  );
}

export default CommunityPage;
