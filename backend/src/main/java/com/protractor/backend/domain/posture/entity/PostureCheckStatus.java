package com.protractor.backend.domain.posture.entity;

/**
 * 클라이언트가 보낸 자세 체크의 상태. 명세 posture-checks의 {@code status} 값이다.
 *
 * <p>
 * 같은 나쁜 자세라도 "지금 발생했다"와 "방금 풀렸다"는 저장 모양이 다르다. 발생은 종료 시각이 비어 있고, 해소는 종료 시각과 해소 사유가
 * 채워진다.
 */
public enum PostureCheckStatus {

	/** 나쁜 자세가 확정됨. events.ended_at을 비워 둔다. */
	DETECTED,

	/** 나쁜 자세가 풀림. events.ended_at과 resolved_by를 채운다. */
	RESOLVED
}
