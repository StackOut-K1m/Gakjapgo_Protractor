// src/constants/studyThumbnails.ts
//
// 방 개설에서 고를 수 있는 기본 썸네일.
//
// 파일은 public/thumbnails/ 에 있고, 저장되는 값은 '/thumbnails/cafe.svg' 같은 상대 경로다.
// 백엔드 thumbnailImageUrl 은 1000자 제한인데 이 경로는 충분히 짧고,
// 개발(Vite)·운영(nginx) 양쪽에서 그대로 정적 서빙된다.
// 즉 백엔드 API·DB 는 손댈 필요가 없다(기존 thumbnailImageUrl 필드를 그대로 쓴다).

export interface StudyThumbnailPreset {
  /** DB 에 저장되는 값 */
  url: string;
  /** 선택 UI 에 보여줄 이름 */
  label: string;
}

/** 과목이 아니라 "공부하는 공간" 컨셉으로 고른다. */
export const STUDY_THUMBNAIL_PRESETS: StudyThumbnailPreset[] = [
  { url: '/thumbnails/cafe.svg', label: '카페' },
  { url: '/thumbnails/study-room.svg', label: '독서실' },
  { url: '/thumbnails/my-room.svg', label: '내 방' },
];

/** 아무것도 고르지 않았을 때의 기본값 */
export const DEFAULT_STUDY_THUMBNAIL = STUDY_THUMBNAIL_PRESETS[0].url;
