// src/components/home/RecommendedRoomsCard.tsx
import type { RecommendedRoom } from '@/types/home';
import { VideoIcon } from './icons';
import styles from './RecommendedRoomCard.module.css';

interface RecommendedRoomsCardProps {
  rooms: RecommendedRoom[];
  loading: boolean;
  error: boolean;
  onEnter: (roomId: string) => void;
  onRetry: () => void;
}

export default function RecommendedRoomsCard({
  rooms,
  loading,
  error,
  onEnter,
  onRetry,
}: RecommendedRoomsCardProps) {
  return (
    <section className={styles['recommend-card']}>
      <h3 className={styles['recommend-title']}>
        바로 입장 가능한 추천 스터디룸
      </h3>

      {loading ? (
        <p className={styles['recommend-state']}>추천 스터디룸을 찾는 중입니다.</p>
      ) : error ? (
        <div className={styles['recommend-state']}>
          <p>추천 스터디룸을 불러오지 못했습니다.</p>
          <button type="button" onClick={onRetry} className={styles['retry-btn']}>
            다시 시도
          </button>
        </div>
      ) : rooms.length === 0 ? (
        <p className={styles['recommend-state']}>
          현재 바로 입장 가능한 진행 중인 방이 없습니다.
        </p>
      ) : (
        <ul className={styles['recommend-list']}>
          {rooms.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => onEnter(room.id)}
                className={styles['recommend-item']}
              >
                <span className={styles['recommend-icon']}>
                  <VideoIcon />
                </span>
                <span className={styles['recommend-text']}>
                  <span className={styles['recommend-name']}>{room.title}</span>
                  <span className={styles['recommend-meta']}>{room.meta}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
