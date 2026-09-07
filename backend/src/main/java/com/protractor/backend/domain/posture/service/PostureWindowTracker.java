package com.protractor.backend.domain.posture.service;

import com.protractor.backend.domain.posture.dto.PostureResult.Judgement;
import com.protractor.backend.domain.posture.entity.PostureType;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 30초 지속 판정. 프레임 단위 판정을 모아 "알림을 보낼 만한 나쁜 자세"인지를 결정한다.
 *
 * <p>
 * 프레임 하나가 나쁘다고 바로 이벤트를 만들면 안 된다. 잠깐 몸을 기울이거나 인식이 한 번 튄 것은 event테이블에 기록되지 않는다.
 * 30초 동안 지켜보고 확정한다.
 *
 * <p>
 * "30초 연속"이 아니라 <b>30초 중 위험 비율</b>로 본다. 연속을 요구하면 프레임 한 번만 튀어도 타이머가 처음부터 다시 시작해서
 * 실제로는 계속 나쁜 자세인데 영영 확정되지 않는다.
 *
 * <p>
 * 확정과 해소의 기준을 다르게 둔다(히스테리시스). 같은 값을 쓰면 임계값 근처에서 확정과 해소가 반복되며 알림이 깜빡인다. 들어가기는
 * 어렵게(30초 중 80%가 위험), 나오기는 쉽게(바른 자세 몇 초 연속) 본다.
 *
 * <p>
 * <b>해소되면 관찰 구간을 통째로 버린다.</b> 상태만 내리고 표본을 남기면 창이 아직 나쁜 표본으로 가득 차 있어서, 자세가 한 프레임만
 * 흐트러져도 곧바로 다시 확정된다. 사용자에게는 자세를 고쳤는데 경고가 껐다 켜지는 것으로 보인다. 창을 비우면 다음 경고는 나쁜 자세 30초를
 * 처음부터 다시 채워야 나간다.
 *
 * <p>
 * 확정된 뒤 자세를 고치지 않고 버티면 창 길이마다 다시 알린다({@link Transition.Kind#SUSTAINED}). 한 번 확정하고 마는 것으로
 * 두면 경고를 무시하는 사람에게는 아무 일도 일어나지 않아, 경고 카운트도 스트레칭 유도도 거기서 멈춘다.
 *
 * <p>
 * 상태는 메모리에 둔다. 서버가 재시작되면 진행 중이던 윈도우는 사라지고 다음 30초부터 다시 쌓인다. 여러 대로 늘릴 때는 Redis로 옮겨야
 * 한다.
 */
@Service
public class PostureWindowTracker {

	private final int alertSeverity;
	private final int releaseSeverity;
	private final int windowSeconds;
	private final double riskRatio;
	private final int recoverySeconds;
	private final long gapSeconds;

	/** 세션별·자세별 최근 판정 이력. 세션 종료 시 {@link #clear(Long)}로 지운다. */
	private final Map<Long, Map<PostureType, Window>> windows = new ConcurrentHashMap<>();

	/** 세션별 마지막 프레임 수신 시각. 측정이 끊긴 구간을 찾는 데 쓴다. */
	private final Map<Long, LocalDateTime> lastFrameAt = new ConcurrentHashMap<>();

	/**
	 * 세션별 나쁜 자세 초. 확정(30초 지속)과 무관하게, 나쁘게 읽힌 프레임을 그대로 센다.
	 *
	 * <p>
	 * 왜 따로 세는가: 점수에 쓰는 bad_posture_seconds를 이벤트 길이의 합으로만 구하면 실제와 크게 어긋난다. 이벤트는 30초
	 * 창의 80%가 위험할 때만 열리고, 바른 자세 {@code recovery-seconds}초면 창이 통째로 비워지기 때문에, 잠깐 흐트러졌다
	 * 고쳐 앉는 흔한 패턴은 <b>단 한 건도 남지 않는다</b>. 그러면 타임랩스에는 나쁜 구간이 빨갛게 찍혀 있는데 결과 화면은
	 * "바른 자세 100%"가 되어 사용자가 화면을 못 믿게 된다.
	 *
	 * <p>
	 * 전송이 1Hz라 프레임 1개 = 1초로 센다. 자세 여러 종류가 동시에 나쁜 프레임도 1초로만 센다 — 종류별로 더하면 나쁜 자세
	 * 시간이 학습 시간을 넘어선다.
	 *
	 * <p>
	 * 이 값은 확정 이벤트를 대신하지 않는다. 경고 횟수({@code warning_count})와 이벤트 행은 그대로 30초 확정 기준이다.
	 * "얼마나 오래 나빴나"와 "몇 번 경고할 만큼 나빴나"는 다른 질문이라 각자의 기준으로 답한다.
	 */
	private final Map<Long, Integer> badPostureSeconds = new ConcurrentHashMap<>();

	public PostureWindowTracker(@Value("${app.posture.alert-severity}") int alertSeverity,
			@Value("${app.posture.release-severity}") int releaseSeverity,
			@Value("${app.posture.window-seconds}") int windowSeconds,
			@Value("${app.posture.risk-ratio}") double riskRatio,
			@Value("${app.posture.recovery-seconds}") int recoverySeconds,
			@Value("${app.posture.gap-seconds}") long gapSeconds) {
		this.alertSeverity = alertSeverity;
		this.releaseSeverity = releaseSeverity;
		this.windowSeconds = windowSeconds;
		this.riskRatio = riskRatio;
		this.recoverySeconds = recoverySeconds;
		this.gapSeconds = gapSeconds;
	}

	/**
	 * 프레임 수신을 기록하고, 직전까지 끊겨 있었는지 알려준다.
	 *
	 * <p>
	 * 브라우저는 스트레칭·휴식 중에 프레임을 보내지 않는다. 탭을 옮기거나 연결이 잠깐 끊겨도 마찬가지다. 그동안 자세가 어땠는지는 알 수
	 * 없는데, 끊기기 전에 열어 둔 이벤트를 그대로 두면 <b>측정하지 않은 시간까지 나쁜 자세로 세어진다</b>. 실제로 33분짜리 세션에서
	 * 나쁜 자세가 44분으로 집계돼 자세 유지율이 0%가 된 적이 있다.
	 *
	 * <p>
	 * 그래서 끊겼다 다시 오면 판정 이력을 비워 30초 관찰부터 새로 시작한다. 끊기기 직전 시각을 돌려주는 것은, 그때 열려 있던 이벤트를
	 * 그 시점에서 닫으라는 뜻이다. 측정하지 못한 시간을 좋게도 나쁘게도 세지 않는 것이 목적이다.
	 *
	 * <p>
	 * 그때 경고 중이던 자세도 함께 돌려준다. 윈도우를 비우면 "경고 중"이라는 기억(alerting)도 사라져서, 재개 후 바른 자세가
	 * 이어져도 RESOLVED 전이가 다시는 나오지 않는다. 화면은 resolved 응답으로만 경고를 내리므로, 여기서 알려 주지 않으면
	 * 스트레칭을 다녀온 사용자가 바르게 앉아 있어도 경고 화면에서 영영 못 빠져나간다.
	 *
	 * @param at 서버 수신 시각
	 * @return 끊긴 구간이 있었다면 그 정보. 이어지고 있으면 비어 있음
	 */
	public Optional<Gap> markFrameAndDetectGap(Long studyRecordId, LocalDateTime at) {
		LocalDateTime previous = lastFrameAt.put(studyRecordId, at);
		if (previous == null || Duration.between(previous, at).toSeconds() <= gapSeconds) {
			return Optional.empty();
		}
		Map<PostureType, Window> removed = windows.remove(studyRecordId);
		List<PostureType> alertingTypes = removed == null ? List.of()
				: removed.entrySet().stream()
						.filter(entry -> entry.getValue().alerting)
						.map(Map.Entry::getKey)
						.toList();
		return Optional.of(new Gap(previous, alertingTypes));
	}

	/**
	 * 측정 끊김.
	 *
	 * @param pausedAt 끊기기 직전 프레임 시각 — 열려 있던 이벤트를 닫을 기준
	 * @param alertingTypes 그때 경고 중이던 자세들 — 응답의 resolved 로 실어 화면 경고를 내린다
	 */
	public record Gap(LocalDateTime pausedAt, List<PostureType> alertingTypes) {
	}

	/**
	 * 마지막으로 프레임을 받은 시각.
	 *
	 * <p>
	 * 세션을 마칠 때 열린 이벤트를 닫는 기준이다. 창을 닫아 끝난 세션은 서버가 한참 뒤에야 종료를 알아채는데, 그 시각으로 닫으면 아무도
	 * 보지 않은 시간까지 나쁜 자세로 남는다.
	 */
	public Optional<LocalDateTime> lastFrameAt(Long studyRecordId) {
		return Optional.ofNullable(lastFrameAt.get(studyRecordId));
	}

	/**
	 * 판정 결과를 윈도우에 넣고, 상태가 바뀐 항목만 돌려준다.
	 *
	 * @param studyRecordId 세션 id
	 * @param judgements 이번 프레임의 3종 판정
	 * @param at 서버 수신 시각. 클라이언트 시계는 조작·오차 가능성이 있어 쓰지 않는다
	 * @return 확정되거나 해소된 항목. 변화가 없으면 빈 목록
	 */
	public List<Transition> apply(Long studyRecordId, List<Judgement> judgements, LocalDateTime at) {
		Map<PostureType, Window> perType = windows.computeIfAbsent(studyRecordId,
				id -> new EnumMap<>(PostureType.class));

		List<Transition> transitions = new ArrayList<>();
		// 이번 프레임에 나쁘게 읽힌 자세가 하나라도 있었는지. 종류 수와 무관하게 1초만 센다.
		boolean risky = false;
		for (Judgement judgement : judgements) {
			// 보류된 판정은 정상도 나쁨도 아니다. 넣으면 비율이 왜곡되므로 건너뛴다.
			if (!judgement.isEvaluated()) {
				continue;
			}
			if (judgement.severity() >= alertSeverity) {
				risky = true;
			}
			Window window = perType.computeIfAbsent(judgement.type(), type -> new Window());
			Transition transition = window.accept(judgement, at);
			if (transition != null) {
				transitions.add(transition);
			}
		}
		if (risky) {
			badPostureSeconds.merge(studyRecordId, 1, Integer::sum);
		}
		return transitions;
	}

	/**
	 * 이 세션에서 나쁜 자세로 읽힌 초. 확정 여부와 무관하다.
	 *
	 * <p>
	 * 메모리에 있는 값이라 서버가 재시작되면 0으로 돌아간다. 호출 측은 이 값이 0일 때 이벤트 합계로 대신해야 한다.
	 */
	public int badPostureSeconds(Long studyRecordId) {
		return badPostureSeconds.getOrDefault(studyRecordId, 0);
	}

	/** 세션이 끝나면 이력을 버린다. 남겨두면 메모리가 계속 늘어난다. */
	public void clear(Long studyRecordId) {
		windows.remove(studyRecordId);
		lastFrameAt.remove(studyRecordId);
		badPostureSeconds.remove(studyRecordId);
	}

	// 열린 이벤트를 닫을 때는 메모리의 판정 이력이 아니라 events 테이블의 열린 행을 기준으로 삼는다
	// (PostureAnalysisService.closeOpenPostureEvents). 서버가 재시작되면 이력은 사라져도 행은 남기 때문이다.

	/** 자세 1종의 최근 판정 이력. 인스턴스마다 따로 잠근다. */
	private final class Window {

		private final Deque<Sample> samples = new ArrayDeque<>();
		private boolean alerting;
		/** 마지막으로 알린 시각. 해소되지 않은 채 창 길이가 또 지나면 다시 알리는 기준이다. */
		private LocalDateTime lastAlertAt;
		/** 연속으로 바른 자세가 나온 표본 수. 전송이 1Hz라 표본 1개가 1초다. */
		private int goodStreak;

		private synchronized Transition accept(Judgement judgement, LocalDateTime at) {
			samples.addLast(new Sample(at, judgement.severity(), judgement.deviationDegrees()));
			evictOlderThanWindow(at);

			// 회복을 먼저 본다. 바른 자세가 recoverySeconds 만큼 이어지면 지금까지 모은 표본을 버린다.
			// 남겨 두면 창이 나쁜 표본으로 가득 찬 상태 그대로라, 자세가 다시 흐트러지는 순간 바로 확정된다.
			goodStreak = judgement.severity() <= releaseSeverity ? goodStreak + 1 : 0;
			if (goodStreak >= recoverySeconds) {
				samples.clear();
				if (!alerting) {
					return null;
				}
				alerting = false;
				lastAlertAt = null;
				return new Transition(judgement.type(), Transition.Kind.RESOLVED, null, at, 0, null);
			}

			// 관찰 구간이 30초를 채우기 전에는 판단하지 않는다.
			if (span() < windowSeconds) {
				return null;
			}
			boolean risky = ratioOf(s -> s.severity >= alertSeverity) >= riskRatio;
			if (!alerting && risky) {
				alerting = true;
				lastAlertAt = at;
				return alert(judgement.type(), at, Transition.Kind.CONFIRMED);
			}
			// 경고를 받고도 고치지 않은 경우. 창 길이가 또 지나면 다시 알린다.
			// 회복(위 goodStreak)에 걸리지 않았다는 것만으로는 부족하다. 심각도 3처럼 해소도 확정도
			// 아닌 구간에서 오래 머무는 것까지 계속 세면 카운트가 실제보다 부푼다.
			// 확정과 같은 기준(risky)을 다시 만족할 때만 센다.
			if (alerting && risky && Duration.between(lastAlertAt, at).toSeconds() >= windowSeconds) {
				lastAlertAt = at;
				return alert(judgement.type(), at, Transition.Kind.SUSTAINED);
			}
			return null;
		}

		/**
		 * 알림 전이를 만든다.
		 *
		 * <p>
		 * 시작 시각은 알림이 울린 지금이 아니라 <b>나쁜 자세가 시작된 시점</b>으로 잡는다. 그래야 지속 시간이 실제 나쁜 자세
		 * 시간과 맞고, 세션 종료 시 bad_posture_seconds 합계도 맞는다.
		 *
		 * <p>
		 * {@link Transition.Kind#SUSTAINED}는 이벤트를 새로 열지 않으므로 시작 시각과 심각도가 쓰이지 않는다. 그래도
		 * 같은 방식으로 채우는 것은, 나중에 반복 알림을 따로 기록하게 되더라도 값이 이미 맞아 있게 하기 위해서다.
		 */
		private Transition alert(PostureType type, LocalDateTime at, Transition.Kind kind) {
			LocalDateTime startedAt = at;
			int maxSeverity = 0;
			BigDecimal maxDeviation = null;
			for (Sample sample : samples) {
				if (sample.severity < alertSeverity) {
					continue;
				}
				if (sample.at.isBefore(startedAt)) {
					startedAt = sample.at;
				}
				maxSeverity = Math.max(maxSeverity, sample.severity);
				if (maxDeviation == null || (sample.deviation != null && sample.deviation.compareTo(maxDeviation) > 0)) {
					maxDeviation = sample.deviation;
				}
			}
			return new Transition(type, kind, startedAt, at, maxSeverity, maxDeviation);
		}

		private void evictOlderThanWindow(LocalDateTime at) {
			// 창 길이보다 1초 오래된 표본까지 남겨 둔다.
			// 정확히 창 길이로 자르면 span()이 항상 windowSeconds "이하"가 되는데,
			// 아래 판정 게이트는 windowSeconds "이상"을 요구해서 두 조건이 모순이 된다.
			// (1Hz 전송 간격이 1초를 조금만 넘어도 span이 9.x초에 머물러 확정이 영원히 불가능)
			LocalDateTime cutoff = at.minusSeconds(windowSeconds + 1L);
			while (!samples.isEmpty() && samples.peekFirst().at.isBefore(cutoff)) {
				samples.removeFirst();
			}
		}

		private long span() {
			if (samples.size() < 2) {
				return 0;
			}
			return Duration.between(samples.peekFirst().at, samples.peekLast().at).toSeconds();
		}

		private double ratioOf(SamplePredicate predicate) {
			if (samples.isEmpty()) {
				return 0;
			}
			long matched = samples.stream().filter(predicate::test).count();
			return (double) matched / samples.size();
		}
	}

	private record Sample(LocalDateTime at, int severity, BigDecimal deviation) {
	}

	@FunctionalInterface
	private interface SamplePredicate {
		boolean test(Sample sample);
	}

	/**
	 * 자세 상태 변화. 이벤트를 새로 만들거나 열린 이벤트를 닫는 신호다.
	 *
	 * @param type 자세 종류
	 * @param kind 확정인지 해소인지
	 * @param startedAt 나쁜 자세가 시작된 시각. 알림일 때만 채워진다
	 * @param occurredAt 상태가 바뀐 시각
	 * @param maxSeverity 윈도우 안에서 관측된 가장 높은 심각도. 알림일 때만 의미가 있다
	 * @param maxDeviation 윈도우 안에서 관측된 가장 큰 이탈 각도
	 */
	public record Transition(PostureType type, Kind kind, LocalDateTime startedAt, LocalDateTime occurredAt,
			int maxSeverity, BigDecimal maxDeviation) {

		public enum Kind {
			/** 30초 지속이 확인됨 → 이벤트 생성 + 알림. */
			CONFIRMED,
			/**
			 * 확정된 자세가 고쳐지지 않고 30초를 더 지속함 → 알림만.
			 *
			 * <p>
			 * 이벤트를 새로 열지 않는다. 이벤트 한 행은 "나쁜 자세가 시작돼서 해소될 때까지" 한 구간을 뜻하고, 지속은 그
			 * 구간이 이어지는 중이라는 뜻이라 새 행이 아니라 같은 행의 길이로 표현되기 때문이다. 30초마다 행을 새로 열면
			 * 열린 채로 남는 행이 쌓여 bad_posture_seconds 집계가 어긋난다.
			 */
			SUSTAINED,
			/** 자세가 돌아옴 → 열린 이벤트의 종료 시각 기록. */
			RESOLVED
		}

		/** 이번에 이벤트를 새로 열어야 하는가. 지속 알림은 이미 열린 이벤트가 있으므로 아니다. */
		public boolean isConfirmed() {
			return kind == Kind.CONFIRMED;
		}

		/** 사용자에게 경고를 띄우고 카운트를 올려야 하는가. 최초 확정과 지속 알림이 모두 해당한다. */
		public boolean isAlerting() {
			return kind == Kind.CONFIRMED || kind == Kind.SUSTAINED;
		}
	}
}
