// src/types/onboarding.ts
// 백엔드 온보딩 API 타입 (/api/v1/onboarding)

/** 관심 태그 — 백엔드 StudyTagResponse */
export interface OnboardingTag {
  studyTagId: number;
  name: string;
}

/**
 * 동의 항목. key 는 저장 요청의 필드명과 같아서, 체크박스 상태를 그대로 요청에 매핑할 수 있다.
 * 지금 백엔드는 postureDetectionConsent / drowsinessDetectionConsent / postureCaptureConsent 를 준다.
 */
export interface OnboardingConsentItem {
  key: ConsentKey;
  label: string;
  description: string;
}

export type ConsentKey =
  | 'postureDetectionConsent'
  | 'drowsinessDetectionConsent'
  | 'postureCaptureConsent';

/** GET /onboarding/options */
export interface OnboardingOptions {
  /** 공부 목적. 서버가 study_tags 이름과 대조해 검증하므로 이 목록 밖의 값은 400 이다. */
  purposes: string[];
  tags: OnboardingTag[];
  consentItems: OnboardingConsentItem[];
}

/** POST /onboarding 요청 */
export interface OnboardingSaveRequest {
  /** 1개 이상 필수 */
  purposes: string[];
  /** 학습 목표 문구. 255자 이하 */
  goalText?: string;
  /** 하루 목표 학습 시간(분). 1 이상. 미전송이면 미설정 */
  goalMinutes?: number;
  tagIds?: number[];
  postureDetectionConsent: boolean;
  drowsinessDetectionConsent: boolean;
  postureCaptureConsent?: boolean;
}

/** POST /onboarding 응답 */
export interface OnboardingSaveResponse {
  memberId: number;
  onboardingCompletedAt: string;
}

/** PATCH /onboarding/me 요청. 보낸 필드만 반영된다(부분 수정). */
export interface OnboardingUpdateRequest {
  purposes?: string[];
  goalText?: string;
  /** 0 을 보내면 목표 해제 */
  goalMinutes?: number;
  tagIds?: number[];
  postureDetectionConsent?: boolean;
  drowsinessDetectionConsent?: boolean;
  postureCaptureConsent?: boolean;
}

/** GET /onboarding/me 응답 */
export interface OnboardingMe {
  purposes: string[];
  goalText: string | null;
  goalMinutes: number | null;
  tags: OnboardingTag[];
  postureDetectionConsent: boolean;
  drowsinessDetectionConsent: boolean;
  postureCaptureConsent: boolean;
  /** 처음 온보딩을 끝낸 시각. 아직 안 했으면 null. 이후 수정으로는 바뀌지 않는다 */
  onboardingCompletedAt: string | null;
  /**
   * 마지막으로 값이 바뀐 시각.
   *
   * 마이페이지의 '마지막 설정'은 이 값을 쓴다 — 온보딩을 다시 해도 완료 시각은 그대로라
   * 그쪽을 보여 주면 날짜가 영영 안 바뀐다.
   */
  updatedAt: string;
}
