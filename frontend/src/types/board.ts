// 게시판(커뮤니티·공지·이벤트·1:1 문의) 공용 타입 (백엔드 domain/board와 1:1 대응)

// 게시글 카테고리(말머리). EVENT는 이벤트 페이지, INQUIRY는 1:1 문의 페이지 전용이라
// 커뮤니티 "전체 게시글" 탭(카테고리 미지정 조회)에는 나오지 않는다.
export type BoardCategory = 'NOTICE' | 'FREE' | 'QNA' | 'SHARE' | 'EVENT' | 'INQUIRY';

export const BOARD_CATEGORY_LABEL: Record<BoardCategory, string> = {
  NOTICE: '공지',
  FREE: '자유',
  QNA: '질문',
  SHARE: '자료공유',
  EVENT: '이벤트',
  INQUIRY: '문의',
};

// 정렬 기준 (GET /boards/posts?sort=)
export type BoardSort = 'latest' | 'views' | 'comments';

// GET /boards/posts 목록 항목
export interface PostSummary {
  postId: number;
  category: BoardCategory;
  title: string;
  authorNickname: string;
  createdAt: string;
  viewCount: number;
  commentCount: number;
  /** 본문 앞부분(최대 120자). 홈의 이벤트 카드처럼 한 줄 설명이 필요한 곳에서 쓴다 */
  excerpt: string;
}

export interface PostListPage {
  posts: PostSummary[];
  page: {
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}

// GET /boards/posts 쿼리 파라미터
export interface PostListQuery {
  category?: BoardCategory;
  keyword?: string;
  sort?: BoardSort;
  page?: number;
  size?: number;
}

// POST /boards/posts 요청. 파일은 글 등록 후 별도 업로드 API(uploadPostAttachments)로 올린다.
export interface PostCreateRequest {
  category: BoardCategory;
  title: string;
  content: string;
}

// POST /boards/posts 응답
export interface PostCreateResponse {
  postId: number;
  createdAt: string;
}

// PATCH /boards/posts/{postId} 요청 — 보낸 필드만 반영된다.
export interface PostUpdateRequest {
  category?: BoardCategory;
  title?: string;
  content?: string;
}

// 게시글 첨부파일 (상세 응답·업로드 응답 공용)
export interface AttachmentItem {
  attachmentId: number;
  originalName: string;
  fileSize: number;
}

// 댓글. mine은 "내가 쓴 댓글인가"로 삭제 버튼 노출에 쓴다.
export interface CommentItem {
  commentId: number;
  authorNickname: string;
  content: string;
  createdAt: string;
  mine: boolean;
}

// GET /boards/posts/{postId} 상세 응답 (댓글·첨부 포함)
export interface PostDetail {
  postId: number;
  category: BoardCategory;
  title: string;
  content: string;
  authorNickname: string;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  commentCount: number;
  attachments: AttachmentItem[];
  comments: CommentItem[];
}
