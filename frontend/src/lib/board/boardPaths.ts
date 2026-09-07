// src/lib/board/boardPaths.ts
//
// 게시판의 주소와 화면 표기를 한 곳에 모은다.
//
// 흩어 두면 같은 지식이 여러 벌 생긴다. 실제로 헤더 드롭다운·게시판 탭·상세의 "목록으로"가
// 각자 주소를 알고 있었고, 그래서 자유게시판에서 글을 열고 돌아오면 전체 게시글로 떨어졌다.
import type { BoardCategory, BoardSort } from '@/types/board';

/**
 * 관리자만 글을 쓸 수 있는 게시판.
 *
 * 서버도 같은 규칙을 403 으로 막는다(BoardService.assertWritable). 화면이 이 목록을 모르면
 * 일반 회원에게 글쓰기를 열어 주고 등록 순간에 403 을 돌려주는 모양이 된다 — 글쓰기 버튼과
 * 글쓰기 모달이 같은 목록을 봐야 해서 여기 둔다.
 */
export const ADMIN_ONLY_BOARDS: BoardCategory[] = ['NOTICE', 'EVENT'];

/** 커뮤니티 게시판 탭. 배열 순서가 곧 화면 순서이고, 헤더 드롭다운도 이 순서를 따른다. */
export const BOARD_TABS: {
  key: BoardCategory | 'ALL';
  label: string;
  path: string;
}[] = [
  // 이모지를 뗐다 — 새 디자인은 말머리를 색 점으로 구분한다(CommunityPage.css 의 [data-cat]).
  // 이모지와 색 점이 같이 있으면 같은 뜻을 두 번 말하면서 탭 폭만 넓어진다.
  { key: 'ALL', label: '전체 게시글', path: '/community' },
  { key: 'NOTICE', label: '공지사항', path: '/community/notice' },
  { key: 'FREE', label: '자유게시판', path: '/community/free' },
  { key: 'QNA', label: '질문하기', path: '/community/questions' },
  { key: 'SHARE', label: '자료공유', path: '/community/resources' },
  { key: 'EVENT', label: '이벤트', path: '/community/events' },
];

export const BOARD_SORTS: { key: BoardSort; label: string }[] = [
  { key: 'latest', label: '최신순' },
  { key: 'views', label: '조회수순' },
  { key: 'comments', label: '댓글순' },
];

/** 주소 → 탭. 모르는 주소면 전체 게시글로 본다. */
export function tabOfPath(pathname: string): BoardCategory | 'ALL' {
  return BOARD_TABS.find((t) => t.path === pathname)?.key ?? 'ALL';
}

/** 탭 → 주소. */
export function pathOfTab(tab: BoardCategory | 'ALL'): string {
  return BOARD_TABS.find((t) => t.key === tab)?.path ?? '/community';
}

/**
 * 글의 게시판이 어느 목록 화면에 속하는지.
 *
 * 이벤트와 1:1 문의는 커뮤니티 탭이 아니라 각자의 화면을 쓴다. 상세에서 "목록으로"를 누를 때
 * 원래 있던 화면으로 돌아가려면 이 구분이 필요하다.
 */
export function listPathOfCategory(category: BoardCategory): string {
  // 1:1 문의만 커뮤니티 탭이 아니라 별도 화면을 쓴다. 나머지는 전부 탭이다.
  if (category === 'INQUIRY') return '/support';
  return pathOfTab(category);
}

/**
 * 목록 화면의 보기 조건을 주소에 싣는다.
 *
 * 정렬·페이지·검색어를 화면 상태로만 들고 있으면, 글을 열었다 돌아왔을 때 3페이지에서 보던
 * 사람이 1페이지 처음으로 떨어진다. 주소에 있으면 뒤로가기와 링크 공유도 같이 산다.
 *
 * 기본값(최신순·0페이지·검색어 없음)은 넣지 않는다. 아무것도 안 건드린 주소가 물음표로
 * 지저분해질 이유가 없다.
 */
export function buildListSearch(params: {
  sort: BoardSort;
  page: number;
  search: string;
}): string {
  const query = new URLSearchParams();
  if (params.sort !== 'latest') query.set('sort', params.sort);
  if (params.page > 0) query.set('page', String(params.page + 1)); // 주소에는 1부터
  if (params.search) query.set('q', params.search);
  const text = query.toString();
  return text ? `?${text}` : '';
}

/** 주소의 물음표 뒤를 목록 조건으로 되돌린다. 값이 이상하면 기본값으로 본다. */
export function parseListSearch(search: URLSearchParams): {
  sort: BoardSort;
  page: number;
  search: string;
} {
  const sort = search.get('sort');
  const page = Number(search.get('page'));
  return {
    sort: BOARD_SORTS.some((s) => s.key === sort) ? (sort as BoardSort) : 'latest',
    // 주소는 1부터, 내부는 0부터. 숫자가 아니거나 1보다 작으면 첫 페이지로 본다.
    page: Number.isFinite(page) && page > 1 ? page - 1 : 0,
    search: search.get('q') ?? '',
  };
}
