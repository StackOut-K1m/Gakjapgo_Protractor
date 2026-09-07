package com.protractor.backend.domain.posture.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.protractor.backend.domain.posture.dto.PostureResult.Judgement;
import com.protractor.backend.domain.posture.entity.PostureType;
import com.protractor.backend.domain.posture.service.PostureWindowTracker.Transition;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 30초 윈도우 검증.
 *
 * <p>
 * 여기서 확인하는 것은 <b>언제 알림이 나가고 언제 안 나가는가</b>다. 특히 확정 이후에도 자세를 고치지 않은 경우를 본다. 알림을 한
 * 번만 보내고 마는 구현이면 경고를 무시하는 사람에게는 그 뒤로 아무 일도 일어나지 않아, 카운트도 스트레칭 유도도 거기서 멈춘다.
 */
class PostureWindowTrackerTest {

	/**
	 * 이 테스트만의 고정값이다. application.yml 을 따라가지 않는다 — 여기서 보는 것은 창을 채우고
	 * 비우는 규칙이지 운영에서 고른 숫자가 아니다. 운영값을 따라가게 만들면 임계값을 조정할 때마다
	 * 관계없는 테스트가 깨진다.
	 */
	private static final int ALERT_SEVERITY = 4;
	private static final int RELEASE_SEVERITY = 2;
	private static final int WINDOW_SECONDS = 30;
	private static final double RISK_RATIO = 0.8;
	private static final int RECOVERY_SECONDS = 2;
	private static final long GAP_SECONDS = 5;

	private static final Long SESSION = 1L;
	private static final PostureType TYPE = PostureType.FORWARD_HEAD;
	private static final LocalDateTime T0 = LocalDateTime.of(2026, 1, 1, 9, 0, 0);

	private final PostureWindowTracker tracker = new PostureWindowTracker(ALERT_SEVERITY, RELEASE_SEVERITY,
			WINDOW_SECONDS, RISK_RATIO, RECOVERY_SECONDS, GAP_SECONDS);

	@Test
	@DisplayName("30초를 채우기 전에는 확정하지 않는다")
	void 창을_채우기_전에는_확정하지_않는다() {
		List<Transition> transitions = feed(0, 29, ALERT_SEVERITY);

		assertThat(transitions).isEmpty();
	}

	@Test
	@DisplayName("나쁜 자세가 30초 지속되면 확정한다")
	void 삼십초_지속되면_확정한다() {
		List<Transition> transitions = feed(0, 30, ALERT_SEVERITY);

		assertThat(transitions).singleElement()
				.satisfies(t -> assertThat(t.kind()).isEqualTo(Transition.Kind.CONFIRMED));
		// 시작 시각은 알림이 울린 30초 시점이 아니라 나쁜 자세가 시작된 시점이어야 한다.
		assertThat(transitions.get(0).startedAt()).isEqualTo(T0);
	}

	@Test
	@DisplayName("고치지 않고 버티면 30초마다 다시 알린다")
	void 고치지_않으면_반복해서_알린다() {
		// 90초 동안 계속 나쁜 자세. 30 / 60 / 90초에 한 번씩, 모두 세 번 알림이 나가야 한다.
		List<Transition> transitions = feed(0, 90, ALERT_SEVERITY);

		assertThat(transitions).hasSize(3);
		assertThat(transitions).extracting(Transition::kind).containsExactly(Transition.Kind.CONFIRMED,
				Transition.Kind.SUSTAINED, Transition.Kind.SUSTAINED);
		assertThat(transitions).extracting(Transition::occurredAt).containsExactly(T0.plusSeconds(30),
				T0.plusSeconds(60), T0.plusSeconds(90));
	}

	@Test
	@DisplayName("지속 알림은 이벤트를 새로 열지 않는다")
	void 지속_알림은_이벤트를_새로_열지_않는다() {
		List<Transition> transitions = feed(0, 60, ALERT_SEVERITY);

		// isConfirmed() 가 이벤트 생성 여부를 가른다. 지속 알림까지 true 면 닫히지 않는 이벤트가 쌓인다.
		assertThat(transitions).filteredOn(Transition::isConfirmed).hasSize(1);
		assertThat(transitions).allMatch(Transition::isAlerting);
	}

	@Test
	@DisplayName("자세를 고치면 해소되고, 다시 나빠지면 처음부터 확정된다")
	void 해소된_뒤에는_다시_확정된다() {
		List<Transition> transitions = feed(0, 30, ALERT_SEVERITY);
		assertThat(transitions).extracting(Transition::kind).containsExactly(Transition.Kind.CONFIRMED);

		// 바른 자세가 이어지는 동안 해소는 한 번만 나가야 한다. 매 프레임 나가면 이벤트 종료가 중복된다.
		transitions = feed(31, 61, 0);
		assertThat(transitions).extracting(Transition::kind).containsExactly(Transition.Kind.RESOLVED);

		// 해소됐으므로 다음 나쁜 자세는 SUSTAINED 가 아니라 CONFIRMED 여야 한다. 새 이벤트가 열려야 하기 때문이다.
		transitions = feed(62, 92, ALERT_SEVERITY);
		assertThat(transitions).extracting(Transition::kind).containsExactly(Transition.Kind.CONFIRMED);
	}

	@Test
	@DisplayName("해소되면 창을 비워, 다시 나빠져도 30초를 새로 채워야 알린다")
	void 해소되면_창을_비운다() {
		assertThat(feed(0, 30, ALERT_SEVERITY)).extracting(Transition::kind)
				.containsExactly(Transition.Kind.CONFIRMED);

		// 바른 자세 2초로 해소된다.
		assertThat(feed(31, 32, 0)).extracting(Transition::kind).containsExactly(Transition.Kind.RESOLVED);

		// 창을 비우지 않았다면 창의 대부분이 아직 나쁜 표본이라 여기 첫 프레임에 바로 재확정된다.
		// 사용자에게는 자세를 고쳤는데 경고가 껐다 켜지는 것으로 보인다.
		assertThat(feed(33, 62, ALERT_SEVERITY)).isEmpty();
		assertThat(feed(63, 63, ALERT_SEVERITY)).extracting(Transition::kind)
				.containsExactly(Transition.Kind.CONFIRMED);
	}

	@Test
	@DisplayName("확정 전에 자세를 고쳐도 창을 비운다")
	void 확정_전_회복도_창을_비운다() {
		// 25초 나쁜 자세. 아직 창을 못 채워 확정 전이다.
		assertThat(feed(0, 25, ALERT_SEVERITY)).isEmpty();
		assertThat(feed(26, 27, 0)).isEmpty();

		// 창을 비우지 않으면 고친 지 몇 초 만에 확정된다 — 이미 쌓인 나쁜 표본이 창의 80%를 넘기 때문이다.
		assertThat(feed(28, 57, ALERT_SEVERITY)).isEmpty();
		assertThat(feed(58, 58, ALERT_SEVERITY)).extracting(Transition::kind)
				.containsExactly(Transition.Kind.CONFIRMED);
	}

	@Test
	@DisplayName("확정 뒤 애매한 구간(해소도 확정도 아님)에서는 다시 알리지 않는다")
	void 애매한_구간에서는_반복하지_않는다() {
		List<Transition> transitions = feed(0, 30, ALERT_SEVERITY);
		assertThat(transitions).hasSize(1);

		// 심각도 3 — 해소 기준(2 이하)에도 확정 기준(4 이상)에도 걸리지 않는다.
		// 나쁜 자세가 아니라고 단정할 수 없어 해소하지 않지만, 카운트를 올릴 근거도 없다.
		transitions = feed(31, 91, 3);
		assertThat(transitions).isEmpty();
	}

	@Test
	@DisplayName("판정 보류 프레임은 지속 시간을 되돌리지도 앞당기지도 않는다")
	void 보류_프레임은_건너뛴다() {
		// 15초 나쁜 자세 → 10초 보류 → 다시 나쁜 자세. 보류 구간을 세지 않으므로 표본 30개가 모여야 확정된다.
		List<Transition> transitions = feed(0, 15, ALERT_SEVERITY);
		assertThat(transitions).isEmpty();

		transitions = apply(skipped(), 16, 26);
		assertThat(transitions).isEmpty();

		transitions = feed(27, 45, ALERT_SEVERITY);
		assertThat(transitions).extracting(Transition::kind).containsExactly(Transition.Kind.CONFIRMED);
	}

	@Test
	@DisplayName("프레임이 이어지는 동안에는 끊김으로 보지 않는다")
	void 이어지는_프레임은_끊김이_아니다() {
		assertThat(tracker.markFrameAndDetectGap(SESSION, T0)).isEmpty();
		// 몇 장 빠져 간격이 벌어져도 기준(5초) 안이면 측정이 이어지는 중이다.
		assertThat(tracker.markFrameAndDetectGap(SESSION, T0.plusSeconds(5))).isEmpty();
	}

	@Test
	@DisplayName("프레임이 오래 끊기면 끊기기 직전 시각을 알려주고 판정 이력을 비운다")
	void 끊긴_구간을_찾아낸다() {
		// 30초 나쁜 자세로 확정까지 간 상태에서 스트레칭이 시작돼 프레임이 멈춘다.
		feed(0, 30, ALERT_SEVERITY);
		tracker.markFrameAndDetectGap(SESSION, T0.plusSeconds(30));

		// 3분 뒤 스트레칭을 마치고 프레임이 다시 온다. 그동안의 자세는 알 수 없으므로
		// 끊기기 직전(30초 시점)을 돌려줘야 한다 — 열린 이벤트를 그 시각에서 닫으라는 뜻이다.
		Optional<PostureWindowTracker.Gap> gap = tracker.markFrameAndDetectGap(SESSION, T0.plusSeconds(210));
		assertThat(gap).isPresent();
		assertThat(gap.get().pausedAt()).isEqualTo(T0.plusSeconds(30));
		// 끊기기 전에 경고 중이던 자세도 알려줘야 한다. 윈도우가 비워지면 RESOLVED 전이가
		// 다시는 나오지 않아서, 이 목록으로 알리지 않으면 화면 경고가 영영 남는다
		// (스트레칭을 다녀오면 바르게 앉아도 경고 화면에서 못 빠져나가던 버그).
		assertThat(gap.get().alertingTypes()).containsExactly(TYPE);

		// 이력이 비워졌으므로 다시 30초를 채워야 확정된다. 끊긴 동안의 시간을 이어서 세면 안 된다.
		assertThat(feed(211, 240, ALERT_SEVERITY)).isEmpty();
		assertThat(feed(241, 241, ALERT_SEVERITY)).extracting(Transition::kind)
				.containsExactly(Transition.Kind.CONFIRMED);
	}

	@Test
	@DisplayName("경고 중이 아니었다면 끊겨도 해제할 자세가 없다")
	void 경고가_없던_끊김은_해제_목록이_빈다() {
		// 10초만 나쁜 자세 — 확정(30초)에 못 미쳐 경고 중이 아니다.
		feed(0, 10, ALERT_SEVERITY);
		tracker.markFrameAndDetectGap(SESSION, T0.plusSeconds(10));

		Optional<PostureWindowTracker.Gap> gap = tracker.markFrameAndDetectGap(SESSION, T0.plusSeconds(180));
		assertThat(gap).isPresent();
		assertThat(gap.get().alertingTypes()).isEmpty();
	}

	@Test
	@DisplayName("세션이 끝나면 마지막 프레임 시각도 함께 지운다")
	void 세션이_끝나면_프레임_시각을_지운다() {
		tracker.markFrameAndDetectGap(SESSION, T0);
		assertThat(tracker.lastFrameAt(SESSION)).contains(T0);

		tracker.clear(SESSION);

		assertThat(tracker.lastFrameAt(SESSION)).isEmpty();
	}

	/** [fromSecond, toSecond] 구간에 1초 간격으로 같은 심각도의 판정을 넣고, 나온 전이를 모아 준다. */
	private List<Transition> feed(int fromSecond, int toSecond, int severity) {
		return apply(new Judgement(TYPE, severity, BigDecimal.valueOf(10), null), fromSecond, toSecond);
	}

	private List<Transition> apply(Judgement judgement, int fromSecond, int toSecond) {
		List<Transition> collected = new ArrayList<>();
		for (int second = fromSecond; second <= toSecond; second++) {
			collected.addAll(tracker.apply(SESSION, List.of(judgement), T0.plusSeconds(second)));
		}
		return collected;
	}

	private Judgement skipped() {
		return Judgement.skipped(TYPE, "LOW_VISIBILITY");
	}
}
