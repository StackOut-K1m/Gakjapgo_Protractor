// src/lib/room/recruiting.ts
//
// 방 카드의 인원 배지. 홈·방 찾기·방 상세가 같은 문구를 써야 해서 여기 모아 둔다.
// 세 곳에 흩어 두면 한쪽만 고치는 실수가 난다(실제로 상세만 "모집 중 · N / M명" 이고
// 나머지 둘은 배지와 인원이 따로 놀았다).

/** 배지를 만들 수 있는 최소한의 방 정보. DTO 마다 필드 이름이 달라 이 모양으로 받는다. */
export interface RoomOccupancy {
  /** 없으면 종료 여부를 모르는 것으로 보고 자리 수만으로 판단한다. */
  status?: string | null;
  currentMembers: number;
  maxMembers: number;
}

/** 모집 중 = 종료되지 않았고 자리가 남은 방. */
export function isRecruiting(room: RoomOccupancy): boolean {
  return room.status !== 'ENDED' && room.currentMembers < room.maxMembers;
}

/** 썸네일 위에 얹는 문구. 예) "모집 중 · 2 / 6명" */
export function occupancyLabel(room: RoomOccupancy): string {
  const state = isRecruiting(room) ? '모집 중' : '마감';
  return `${state} · ${room.currentMembers} / ${room.maxMembers}명`;
}
