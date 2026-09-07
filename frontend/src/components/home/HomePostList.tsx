// src/components/home/HomePostList.tsx
import { Link } from 'react-router-dom';

import { formatPostDate, isNewPost } from '@/lib/board/postDate';
import styles from './HomePostList.module.css';

/** 홈 목록에 필요한 최소한의 글 정보. 공지·이벤트 둘 다 이 모양으로 맞춰 넘긴다. */
export interface HomePostItem {
  id: string;
  title: string;
  createdAt: string;
}

interface HomePostListProps {
  heading: string;
  /** 제목 옆 작은 글씨. 무엇을 보여 주는지 밝혀야 할 때만 쓴다(예: "최근 7일"). */
  hint?: string;
  /** '전체 보기'가 갈 곳 */
  moreTo: string;
  posts: HomePostItem[];
  emptyText: string;
}

/**
 * 홈의 공지·이벤트가 함께 쓰는 목록 카드.
 *
 * 둘은 성격이 같다 — 관리자가 올린 글을 최신순 몇 개만 보여 주고, 누르면 상세로 간다.
 * 그래서 컴포넌트를 하나만 두고 제목·링크만 바꿔 쓴다. 따로 두면 한쪽만 고치는 실수가
 * 나고(예전에 공지는 표, 이벤트는 카드였다) 나란히 놓였을 때 규칙이 두 개로 읽힌다.
 *
 * 높이는 부모 격자가 맞춘다(HomePage 의 news-grid 는 stretch). 목록이 남는 자리를
 * 차지하므로 글 수가 달라도 두 카드의 아래선이 어긋나지 않는다.
 */
export default function HomePostList({
  heading,
  hint,
  moreTo,
  posts,
  emptyText,
}: HomePostListProps) {
  return (
    <section className={styles['post-card']}>
      <div className={styles['card-head']}>
        <h2 className={styles['card-title']}>{heading}</h2>
        {hint && <span className={styles['card-hint']}>{hint}</span>}
        <Link to={moreTo} className={styles['card-more']}>
          전체 보기
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className={styles['card-empty']}>{emptyText}</p>
      ) : (
        <ul className={styles['post-list']}>
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                to={`/community/posts/${post.id}`}
                className={styles['post-item']}
              >
                <span className={styles['post-title']}>{post.title}</span>
                <span className={styles['post-meta']}>
                  {/* 새 글에만 붙는다. 항상 붙으면 배지가 아니라 장식이 된다 */}
                  {isNewPost(post.createdAt) && (
                    <span className={styles['post-new']}>N</span>
                  )}
                  <time className={styles['post-date']} dateTime={post.createdAt}>
                    {formatPostDate(post.createdAt)}
                  </time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
