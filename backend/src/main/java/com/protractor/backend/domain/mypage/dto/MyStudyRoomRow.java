package com.protractor.backend.domain.mypage.dto;

import java.time.LocalDateTime;

/**
 * 최근 스터디 목록 조회 결과 한 줄(방 하나 = 한 줄). 응답 변환 전의 내부용 프로젝션이다.
 *
 * <p>
 * record가 아니라 인터페이스인 것은 조회가 네이티브 쿼리이기 때문이다. 네이티브 쿼리는
 * JPQL처럼 {@code new ...()} 로 결과를 바로 만들 수 없고, Spring Data가 컬럼 별칭을 게터
 * 이름에 맞춰 채워 준다. 네이티브로 간 이유는 {@code MyPageQueryRepository} 주석에 있다.
 *
 * <p>
 * 시간 값이 {@code Long}인 것은 SUM 결과라서다. 한 방을 여러 날에 걸쳐 쓰면 학습일마다
 * 기록이 나뉘는데, 이 조회는 그것을 방 단위로 합친다.
 */
public interface MyStudyRoomRow {

	Long getRoomId();

	String getTitle();

	/** WAITING / RUNNING / ENDED. 네이티브 조회라 enum이 아니라 문자열로 온다. */
	String getStatus();

	Long getHostMemberId();

	/** 그 방에서 마지막으로 참여한 시각. 목록 정렬 기준이자 화면에 찍히는 날짜다. */
	LocalDateTime getJoinedAt();

	Long getTotalStudySeconds();

	Long getFocusedSeconds();

	Long getAwaySeconds();
}
