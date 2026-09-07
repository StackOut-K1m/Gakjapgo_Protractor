import { api } from '@/api/client';
import type {
  AttachmentItem,
  BoardCategory,
  CommentItem,
  PostCreateRequest,
  PostCreateResponse,
  PostDetail,
  PostListPage,
  PostListQuery,
  PostSummary,
  PostUpdateRequest,
} from '@/types/board';

/**
 * 게시판을 목 데이터로 돌릴지.
 *
 * 게시판은 서버 구현이 끝나서 실 API 가 기본이다. 공용 VITE_USE_MOCK 을 쓰지 않는 이유는,
 * 그 값이 마이페이지·리포트와 한 몸이라 게시판 하나 켜자고 아직 서버가 없는 화면까지
 * 실 API 로 끌고 가기 때문이다. 게시판만 따로 되돌릴 수 있게 자기 값을 쓴다.
 *
 * 서버가 죽었을 때 목으로 잠깐 돌리려면 .env.local 에 VITE_USE_MOCK_BOARD=true 를 둔다.
 */
const USE_MOCK = import.meta.env.VITE_USE_MOCK_BOARD === 'true';

/**
 * 목 응답이 일부러 기다리는 시간.
 *
 * 실제 서버를 흉내 내려고 두었는데, 300ms 는 눈에 띄게 길어서 탭을 옮길 때마다 "불러오는 중"이
 * 또렷하게 깜빡였다. 비동기라는 사실만 지키면 되므로 체감되지 않을 만큼만 남긴다.
 */
const delay = (ms = 60) => new Promise((r) => setTimeout(r, ms));

// ── 목 데이터 (피그마 comunity 화면 기준 + 페이지네이션용 추가분) ──
let nextPostId = 18;
let nextCommentId = 100;

const mockPosts: PostSummary[] = [
  { postId: 1, category: 'NOTICE', title: '[필독] 각잡고 스터디 플래너 연동 및 이용 가이드', authorNickname: '김철수 (팀장)', createdAt: '2026-02-20T09:00:00Z', viewCount: 412, commentCount: 18, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 2, category: 'SHARE', title: '리액트 렌더링 최적화 기술 요약 노트 배포합니다', authorNickname: '이영희', createdAt: '2026-02-24T10:00:00Z', viewCount: 128, commentCount: 6, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 3, category: 'QNA', title: '서스펜스(Suspense) 비동기 처리 도중 에러가 전파되는 이슈 해결법', authorNickname: '박민수', createdAt: '2026-02-23T14:30:00Z', viewCount: 84, commentCount: 11, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 4, category: 'FREE', title: '오늘 뽀모도로 4타임 채웠습니다! 다들 화이팅해요', authorNickname: '정다은', createdAt: '2026-02-22T20:15:00Z', viewCount: 52, commentCount: 4, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 5, category: 'SHARE', title: '코딩 인터뷰 준비용 알고리즘 치트시트 공유합니다', authorNickname: '강동우', createdAt: '2026-02-21T11:00:00Z', viewCount: 210, commentCount: 9, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 6, category: 'QNA', title: 'Next.js 14 App Router 서버 컴포넌트 세션 쿠키 질문', authorNickname: '최현욱', createdAt: '2026-02-20T16:45:00Z', viewCount: 76, commentCount: 5, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 7, category: 'FREE', title: '아침 6시 기상 스터디 3주차 후기', authorNickname: '한지민', createdAt: '2026-02-19T07:30:00Z', viewCount: 95, commentCount: 12, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 8, category: 'QNA', title: 'TypeScript 제네릭 조건부 타입 추론이 안 되는 경우', authorNickname: '오세훈', createdAt: '2026-02-18T13:20:00Z', viewCount: 63, commentCount: 7, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 9, category: 'SHARE', title: 'CS 면접 대비 운영체제 핵심 정리 PDF', authorNickname: '이영희', createdAt: '2026-02-17T09:10:00Z', viewCount: 301, commentCount: 15, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 10, category: 'FREE', title: '집중 잘 되는 로파이 플레이리스트 추천', authorNickname: '정다은', createdAt: '2026-02-16T22:00:00Z', viewCount: 44, commentCount: 3, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 11, category: 'QNA', title: '자세 감지 카메라 인식이 자꾸 끊기는데 해결법 있나요?', authorNickname: '민경훈', createdAt: '2026-02-15T18:40:00Z', viewCount: 121, commentCount: 8, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 12, category: 'NOTICE', title: '2월 4주차 서버 점검 안내 (2/28 02:00~04:00)', authorNickname: '운영팀', createdAt: '2026-02-14T10:00:00Z', viewCount: 233, commentCount: 2, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 13, category: 'FREE', title: '정처기 실기 같이 준비하실 분 계신가요?', authorNickname: '강동우', createdAt: '2026-02-13T15:25:00Z', viewCount: 87, commentCount: 10, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 14, category: 'SHARE', title: '주간 회고 템플릿(노션) 공유합니다', authorNickname: '한지민', createdAt: '2026-02-12T08:50:00Z', viewCount: 156, commentCount: 6, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 15, category: 'EVENT', title: '3월 출석 챌린지 — 21일 연속 접속하면 스타벅스 기프티콘!', authorNickname: '운영팀', createdAt: '2026-02-25T10:00:00Z', viewCount: 320, commentCount: 14, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 16, category: 'EVENT', title: '친구 초대 이벤트: 초대할 때마다 프리미엄 7일 이용권', authorNickname: '운영팀', createdAt: '2026-02-18T10:00:00Z', viewCount: 188, commentCount: 5, excerpt: '(목 데이터) 본문 미리보기입니다.' },
  { postId: 17, category: 'INQUIRY', title: '스터디룸 캠이 검은 화면으로만 나와요', authorNickname: '테스터', createdAt: '2026-02-23T09:00:00Z', viewCount: 3, commentCount: 1, excerpt: '(목 데이터) 본문 미리보기입니다.' },
];

const COMMUNITY_CATEGORIES: BoardCategory[] = ['NOTICE', 'FREE', 'QNA', 'SHARE'];

// 상세 본문·댓글·첨부는 필요한 만큼만 목으로 관리한다. 없는 글은 기본 본문을 보여준다.
const mockContents = new Map<number, string>([
  [1, '스터디 플래너 연동 방법을 안내드립니다.\n\n1. 마이페이지 > 캘린더에서 일정을 등록하세요.\n2. 스터디룸 개설 시 일정을 연결할 수 있습니다.\n3. 주간 리포트에서 목표 달성률을 확인하세요.'],
  [15, '3월 한 달간 출석 챌린지를 진행합니다.\n\n- 기간: 3/1 ~ 3/31\n- 조건: 21일 이상 접속 + 하루 1시간 이상 학습\n- 보상: 스타벅스 기프티콘 (추첨 30명)'],
  [17, '어제부터 스터디룸에 들어가면 제 캠이 검은 화면으로만 나옵니다. 권한은 허용돼 있어요.'],
]);
const mockComments = new Map<number, CommentItem[]>([
  [17, [{ commentId: 1, authorNickname: '운영팀', content: '안녕하세요! 브라우저 설정 > 카메라 권한을 확인 후 다시 시도해 보시겠어요?', createdAt: '2026-02-23T10:30:00Z', mine: false }]],
]);
const mockAttachments = new Map<number, AttachmentItem[]>();
// 이 세션에서 목으로 작성한 글(내 글 취급 → 수정/삭제 버튼 노출)
const mockMyPostIds = new Set<number>();

function applyMockQuery(query: PostListQuery): PostListPage {
  const { category, keyword, sort = 'latest', page = 0, size = 6 } = query;

  let list = [...mockPosts];
  // 서버와 동일하게, 카테고리 미지정(전체 게시글)에는 이벤트·문의를 섞지 않는다.
  list = category
    ? list.filter((p) => p.category === category)
    : list.filter((p) => COMMUNITY_CATEGORIES.includes(p.category));
  if (keyword?.trim()) {
    const kw = keyword.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(kw) ||
        p.authorNickname.toLowerCase().includes(kw),
    );
  }

  list.sort((a, b) => {
    // 공지는 항상 상단(서버의 notice-first 정렬과 동일)
    const pin = Number(b.category === 'NOTICE') - Number(a.category === 'NOTICE');
    if (pin !== 0) return pin;
    if (sort === 'views') return b.viewCount - a.viewCount;
    if (sort === 'comments') return b.commentCount - a.commentCount;
    return b.createdAt.localeCompare(a.createdAt); // latest
  });

  const totalElements = list.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / size));
  const posts = list.slice(page * size, page * size + size);

  return { posts, page: { page, size, totalElements, totalPages } };
}

function mockDetailOf(postId: number): PostDetail {
  const summary = mockPosts.find((p) => p.postId === postId);
  if (!summary) throw new Error('게시글을 찾을 수 없습니다.');
  summary.viewCount += 1;
  const comments = mockComments.get(postId) ?? [];
  return {
    postId: summary.postId,
    category: summary.category,
    title: summary.title,
    content: mockContents.get(postId) ?? '(목 데이터) 본문 내용입니다.',
    authorNickname: summary.authorNickname,
    mine: mockMyPostIds.has(postId),
    createdAt: summary.createdAt,
    updatedAt: summary.createdAt,
    viewCount: summary.viewCount,
    commentCount: comments.length,
    attachments: mockAttachments.get(postId) ?? [],
    comments,
  };
}

// ── API 함수 ─────────────────────────────────────────────────

/**
 * 홈 화면에 띄울 최근 공지·이벤트.
 *
 * 게시판 목록 API를 그대로 쓴다. 홈 전용 엔드포인트를 따로 두면 같은 조회가 두 벌이 되고,
 * 게시판 규칙(숨김 글 제외·정렬)이 바뀔 때 한쪽만 고쳐지기 쉽다.
 *
 * 이벤트 카드는 한 줄 설명이 필요해서 목록 응답의 excerpt(본문 앞 120자)를 쓴다.
 * 상세를 따로 부르면 카드 수만큼 요청이 늘어난다.
 */
export async function getHomeNotices(size = 3): Promise<PostSummary[]> {
  const { posts } = await getPosts({ category: 'NOTICE', sort: 'latest', page: 0, size });
  return posts;
}

export async function getHomeEvents(size = 2): Promise<PostSummary[]> {
  const { posts } = await getPosts({ category: 'EVENT', sort: 'latest', page: 0, size });
  return posts;
}

// GET /boards/posts — 게시글 목록 (검색·정렬·페이지네이션, category 생략 시 커뮤니티 전체)
export async function getPosts(query: PostListQuery = {}): Promise<PostListPage> {
  if (USE_MOCK) {
    await delay();
    return applyMockQuery(query);
  }
  const { data } = await api.get<PostListPage>('/boards/posts', { params: query });
  return data;
}

// GET /boards/posts/{postId} — 상세 (조회수 +1, 댓글·첨부 포함)
export async function getPost(postId: number): Promise<PostDetail> {
  if (USE_MOCK) {
    await delay();
    return mockDetailOf(postId);
  }
  const { data } = await api.get<PostDetail>(`/boards/posts/${postId}`);
  return data;
}

// POST /boards/posts — 게시글 작성
export async function createPost(body: PostCreateRequest): Promise<PostCreateResponse> {
  if (USE_MOCK) {
    await delay();
    const created: PostSummary = {
      postId: nextPostId++,
      category: body.category,
      title: body.title,
      authorNickname: '테스터',
      createdAt: new Date().toISOString(),
      viewCount: 0,
      commentCount: 0,
      excerpt: body.content.slice(0, 120),
    };
    mockPosts.unshift(created);
    mockContents.set(created.postId, body.content);
    mockMyPostIds.add(created.postId);
    return { postId: created.postId, createdAt: created.createdAt };
  }
  const { data } = await api.post<PostCreateResponse>('/boards/posts', body);
  return data;
}

// PATCH /boards/posts/{postId} — 부분 수정 (작성자만)
export async function updatePost(postId: number, body: PostUpdateRequest): Promise<PostDetail> {
  if (USE_MOCK) {
    await delay();
    const summary = mockPosts.find((p) => p.postId === postId);
    if (!summary) throw new Error('게시글을 찾을 수 없습니다.');
    if (body.category) summary.category = body.category;
    if (body.title !== undefined) summary.title = body.title;
    if (body.content !== undefined) mockContents.set(postId, body.content);
    summary.viewCount -= 1; // mockDetailOf가 +1 하므로 수정 응답에서는 상쇄
    return mockDetailOf(postId);
  }
  const { data } = await api.patch<PostDetail>(`/boards/posts/${postId}`, body);
  return data;
}

// DELETE /boards/posts/{postId} — 삭제 (작성자 또는 관리자)
export async function deletePost(postId: number): Promise<void> {
  if (USE_MOCK) {
    await delay();
    const idx = mockPosts.findIndex((p) => p.postId === postId);
    if (idx >= 0) mockPosts.splice(idx, 1);
    return;
  }
  await api.delete(`/boards/posts/${postId}`);
}

// POST /boards/posts/{postId}/comments — 댓글 작성
export async function createComment(postId: number, content: string): Promise<CommentItem> {
  if (USE_MOCK) {
    await delay();
    const created: CommentItem = {
      commentId: nextCommentId++,
      authorNickname: '테스터',
      content,
      createdAt: new Date().toISOString(),
      mine: true,
    };
    const list = mockComments.get(postId) ?? [];
    list.push(created);
    mockComments.set(postId, list);
    const summary = mockPosts.find((p) => p.postId === postId);
    if (summary) summary.commentCount = list.length;
    return created;
  }
  const { data } = await api.post<CommentItem>(`/boards/posts/${postId}/comments`, { content });
  return data;
}

// DELETE /boards/comments/{commentId} — 댓글 삭제 (작성자 또는 관리자)
export async function deleteComment(commentId: number): Promise<void> {
  if (USE_MOCK) {
    await delay();
    for (const [postId, list] of mockComments) {
      const idx = list.findIndex((c) => c.commentId === commentId);
      if (idx >= 0) {
        list.splice(idx, 1);
        const summary = mockPosts.find((p) => p.postId === postId);
        if (summary) summary.commentCount = list.length;
        return;
      }
    }
    return;
  }
  await api.delete(`/boards/comments/${commentId}`);
}

// POST /boards/posts/{postId}/attachments — 파일 첨부 (작성자만, 최대 5개·파일당 10MB)
export async function uploadPostAttachments(
  postId: number,
  files: File[],
): Promise<AttachmentItem[]> {
  if (USE_MOCK) {
    await delay();
    const list = mockAttachments.get(postId) ?? [];
    files.forEach((file, i) => {
      list.push({ attachmentId: postId * 100 + list.length + i + 1, originalName: file.name, fileSize: file.size });
    });
    mockAttachments.set(postId, list);
    return list;
  }
  const form = new FormData();
  files.forEach((file) => form.append('files', file));
  // Content-Type은 여기서 지정하지 않는다. 공통 인스턴스의 기본값(application/json)을
  // 지우는 일은 client.ts 의 요청 인터셉터가 FormData 를 보고 대신 해 준다 — 여기서
  // 직접 지정하면 boundary 가 빠져 서버가 multipart 로 읽지 못한다.
  const { data } = await api.post<AttachmentItem[]>(`/boards/posts/${postId}/attachments`, form);
  return data;
}

export interface AttachmentFile {
  blob: Blob;
  filename: string;
}

// GET /boards/attachments/{attachmentId}/download — 첨부 내려받기.
// 파일 이름은 X-Attachment-Filename 헤더(URL 인코딩)로 받는다. blob 응답에서는
// Content-Disposition을 브라우저가 대신 처리해 주지 않기 때문이다(리포트 PDF와 같은 방식).
export async function downloadPostAttachment(
  attachmentId: number,
  fallbackName: string,
): Promise<AttachmentFile> {
  if (USE_MOCK) {
    await delay();
    return { blob: new Blob(['(목 데이터) 첨부파일 내용'], { type: 'text/plain' }), filename: fallbackName };
  }
  const res = await api.get<Blob>(`/boards/attachments/${attachmentId}/download`, {
    responseType: 'blob',
  });
  const encoded = (res.headers as Record<string, string>)['x-attachment-filename'];
  return { blob: res.data, filename: encoded ? decodeURIComponent(encoded) : fallbackName };
}

/**
 * GET /boards/posts/counts — 말머리별 글 수. 커뮤니티 탭 옆 숫자에 쓴다.
 *
 * 탭마다 목록을 한 번씩 더 부르지 않으려고 서버가 한 번에 내려준다.
 * 키는 ALL·NOTICE·FREE·QNA·SHARE·EVENT. 1:1 문의는 본인 글만 보이는 규칙이라 없다.
 */
export async function getPostCounts(): Promise<Record<string, number>> {
  if (USE_MOCK) {
    await delay();
    const counts: Record<string, number> = { ALL: 0 };
    for (const post of mockPosts) {
      counts[post.category] = (counts[post.category] ?? 0) + 1;
      if (post.category !== 'EVENT' && post.category !== 'INQUIRY') counts.ALL += 1;
    }
    return counts;
  }
  const { data } = await api.get<Record<string, number>>('/boards/posts/counts');
  return data;
}
