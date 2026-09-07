// src/components/home/RoomCard.tsx
import { occupancyLabel } from '@/lib/room/recruiting';
import type { StudyRoom } from '@/types/home';
import { LockIcon } from './icons';
import styles from './RoomCard.module.css';

interface RoomCardProps {
  room: StudyRoom;
  onEnter: (roomId: string) => void;
}

export default function RoomCard({ room, onEnter }: RoomCardProps) {
  return (
    <article className={styles['room-card']}>
      {/* 누르면 상세 페이지로 간다. 정원이 찬 방도 막지 않는다 —
          들어가지는 못해도 규칙·소개글은 볼 수 있어야 하고, 방 목록(스터디 방 찾기)의
          카드도 같은 이유로 마감된 방을 비활성화하지 않는다. */}
      <button
        type="button"
        onClick={() => onEnter(room.id)}
        className={styles['room-thumb']}
        aria-label={`${room.title} 상세 보기`}
      >
        {room.thumbnailUrl && (
          <img
            src={room.thumbnailUrl}
            alt=""
            className={styles['room-thumb-image']}
            onError={(e) => {
              // 이미지가 깨져도 카드 레이아웃은 유지되도록 이미지만 감춘다.
              e.currentTarget.style.display = 'none';
            }}
          />
        )}

        {/* 방 상세와 같은 배지다. 카드에서 보고 들어간 사람이 같은 표시를 같은 자리에서
            다시 봐야 해서 문구·위치를 맞춰 뒀다. */}
        <span className={styles['room-badge']}>
          {occupancyLabel({
            status: room.status,
            currentMembers: room.participants,
            maxMembers: room.capacity,
          })}
        </span>
        {room.locked && (
          <span className={styles['room-lock']} title="비공개 방">
            <LockIcon size={14} />
            비공개
          </span>
        )}
      </button>

      <h3 className={styles['room-name']}>{room.title}</h3>

      {room.tags.length > 0 && (
        <p className={styles['room-tags']}>
          {room.tags.map((tag) => (
            <span key={tag} className={styles['room-tag']}>
              {tag}
            </span>
          ))}
        </p>
      )}
    </article>
  );
}