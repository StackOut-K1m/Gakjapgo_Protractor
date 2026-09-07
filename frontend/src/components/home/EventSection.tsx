// src/components/home/EventSection.tsx
import { RECENT_EVENT_DAYS } from '@/lib/board/postDate';
import type { EventItem } from '@/types/home';
import HomePostList from './HomePostList';

interface EventSectionProps {
  events: EventItem[];
  /**
   * 최근 7일 안에 올라온 이벤트가 없어 최신 것으로 대신 채웠는지.
   *
   * 그냥 비워 두면 "이벤트가 아예 없는 서비스"로 읽힌다. 무엇을 보여 주고 있는지
   * 제목 옆에 밝혀야 사용자가 오해하지 않는다.
   */
  fellBack: boolean;
}

/** 홈의 이벤트. 공지와 성격이 같아 같은 목록 카드를 쓴다(HomePostList). */
export default function EventSection({ events, fellBack }: EventSectionProps) {
  return (
    <HomePostList
      heading="이벤트"
      hint={fellBack ? '최근 이벤트' : `최근 ${RECENT_EVENT_DAYS}일`}
      moreTo="/community/events"
      posts={events}
      emptyText="진행 중인 이벤트가 없어요."
    />
  );
}
