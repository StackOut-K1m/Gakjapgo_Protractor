// src/components/home/NoticeSection.tsx
import type { Notice } from '@/types/home';
import HomePostList from './HomePostList';

interface NoticeSectionProps {
  notices: Notice[];
}

/** 홈의 공지사항. 이벤트와 같은 목록 카드를 쓴다(HomePostList). */
export default function NoticeSection({ notices }: NoticeSectionProps) {
  return (
    <HomePostList
      heading="공지사항"
      moreTo="/community/notice"
      posts={notices}
      emptyText="아직 올라온 공지가 없어요."
    />
  );
}
