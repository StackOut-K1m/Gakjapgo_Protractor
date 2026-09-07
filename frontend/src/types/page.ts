/**
 * 서버 목록 응답에 공통으로 붙는 페이지 정보.
 *
 * 게시판·마이페이지는 각자 파일 안에 같은 모양을 따로 적어 두었다. 친구·DM·알림 세 도메인이
 * 같은 값을 쓰므로 여기 한 번만 두고 셋이 공유한다. 기존 파일을 고치지는 않았다 —
 * 이번 작업 범위가 아닌 화면을 건드릴 이유가 없다.
 */
export interface PageMeta {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * 서버가 허용하는 최대 페이지 크기.
 *
 * 친구 목록·회원 검색·받은 요청 모두 1~100 으로 검증한다(FriendshipController). 이보다 크게
 * 보내면 400 이다. 친구 목록은 화면에서 로컬 필터로 걸러 쓰므로 이 값으로 한 번에 받는다.
 */
export const MAX_PAGE_SIZE = 100;
