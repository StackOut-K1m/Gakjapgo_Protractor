package com.protractor.backend.domain.studyroom.service;

import java.time.Duration;

/**
 * 방 생명주기 타이밍 상수.
 *
 * <p>
 * 설계 결정 9-3의 표와 1:1로 대응한다. 값들이 서로 맞물려 있어(유예를 늘리면 청소 주기도 같이 봐야 한다) 흩어 두면 한쪽만
 * 고치는 실수가 난다. 문서와 대조하기 쉽도록 한 곳에 모았다.
 */
public final class RoomLifecyclePolicy {

	/**
	 * 방을 만든 뒤 방장이 준비 화면에 머물 수 있는 시간. 지나면 스케줄러가 방을 지운다.
	 *
	 * <p>
	 * 준비 화면에서 권한 허용 → MediaPipe 모델 로딩 → 캘리브레이션을 거친다. 처음 2분으로 잡았으나 권한 팝업을 못 찾거나
	 * 캘리브레이션을 다시 하면 쉽게 넘겨, 방장이 준비 중인데 방이 사라지는 일이 생긴다. 목록에서 WAITING을 감추므로
	 * (9-5) 짧게 잡아 얻는 것이 없어 넉넉히 둔다.
	 */
	public static final Duration WAITING_TTL = Duration.ofMinutes(10);

	/** 사람이 모두 나간 뒤 재입장을 받아 주는 시간. 이 시간이 지나면 스케줄러가 방을 지운다. */
	public static final Duration ENDED_TTL = Duration.ofSeconds(30);

	/**
	 * WebSocket이 끊긴 뒤 퇴장으로 확정하기까지의 유예.
	 *
	 * <p>
	 * 서버는 새로고침과 강제 종료를 구분할 수 없다. 둘 다 연결이 끊길 뿐이다. 복귀에는 페이지 로드·JWT·WebSocket
	 * 재연결만이 아니라 OpenVidu 재연결과 MediaPipe 모델 재로딩이 들어가므로 넉넉해야 한다. 짧게 잡으면 느린 PC에서
	 * 새로고침이 퇴장으로 처리된다.
	 */
	public static final Duration DISCONNECT_GRACE = Duration.ofSeconds(20);

	/**
	 * 이탈 청소 주기(ms).
	 *
	 * <p>
	 * 유예가 지난 사람만 훑으므로 평소에는 순회할 대상이 없다(DB도 건드리지 않는다). 짧게 잡아도 비용이 거의 없어 유예에
	 * 맞춰 촘촘히 둔다. 실제 정리 시점은 유예 + 최대 이 주기다.
	 */
	public static final long SWEEP_INTERVAL_MS = 3_000L;

	/** 만료된 방을 지우는 주기(ms). 방 삭제는 급할 일이 아니라 넉넉히 둔다. */
	public static final long EXPIRY_SWEEP_INTERVAL_MS = 10_000L;

	/** 방이 비어서 끝난 경우의 종료 사유. */
	public static final String END_REASON_EMPTY = "EMPTY";

	/** 서버 재시작으로 접속이 끊긴 것이 확정된 경우의 종료 사유. */
	public static final String END_REASON_SERVER_RESTART = "SERVER_RESTART";

	private RoomLifecyclePolicy() {
	}
}
