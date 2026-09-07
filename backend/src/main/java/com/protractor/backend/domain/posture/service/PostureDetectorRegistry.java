package com.protractor.backend.domain.posture.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * 등록된 판정기를 모아 두고 요청마다 하나를 고른다.
 *
 * <p>
 * 예전에는 {@code app.posture.detector} 설정으로 빈 하나만 띄웠다. 방식을 바꾸려면 서버를 다시 띄워야 해서, 같은 사람이
 * 같은 자세로 두 방식을 비교하는 것이 사실상 불가능했다. 지금은 구현체를 모두 등록해 두고 요청 본문의 값으로 고른다.
 *
 * <p>
 * <b>몇 종류가 될지 모르는 것을 전제로 만들었다.</b> 목록을 코드에 적지 않고 스프링이 주입한 빈을 그대로 쓰기 때문에, 새 방식을 추가할
 * 때 이 클래스도 컨트롤러도 프론트엔드도 고칠 필요가 없다. {@link PostureDetector}를 구현하고 빈으로 등록하면 목록과 화면
 * 버튼에 저절로 나타난다.
 *
 * <p>
 * 판정 방식은 점수와 랭킹의 근거라서, 어느 것으로 판정했는지는 {@code events.metadata}에 판정기 이름으로 남는다. 나중에 방식별
 * 정확도를 맞대볼 때 이 값으로 나눈다.
 */
@Component
public class PostureDetectorRegistry {

	private static final Logger log = LoggerFactory.getLogger(PostureDetectorRegistry.class);

	private final Map<String, PostureDetector> byKey;
	private final PostureDetector defaultDetector;

	/**
	 * @param detectors 스프링이 찾은 모든 구현체. 등록 순서에 기대지 않으려고 키 순으로 정렬해 담는다. 주입 순서는 보장되지 않아서,
	 *     정렬하지 않으면 화면의 버튼 순서가 배포마다 달라질 수 있다
	 * @param defaultKey 요청이 판정기를 지정하지 않았을 때 쓸 기본값({@code app.posture.detector})
	 */
	public PostureDetectorRegistry(List<PostureDetector> detectors,
			@Value("${app.posture.detector}") String defaultKey) {
		this.byKey = new LinkedHashMap<>();
		for (PostureDetector detector : detectors.stream().sorted((a, b) -> a.key().compareTo(b.key())).toList()) {
			PostureDetector previous = byKey.put(detector.key(), detector);
			if (previous != null) {
				throw new IllegalStateException(
						"판정기 키가 겹칩니다: '%s' (%s, %s). PostureDetector.key()는 구현체마다 달라야 합니다."
								.formatted(detector.key(), previous.name(), detector.name()));
			}
		}

		this.defaultDetector = byKey.get(defaultKey);
		if (defaultDetector == null) {
			// 조용히 다른 판정기로 흘러가면 하이브리드로 실험한 줄 알고 며칠치 데이터를 버리게 된다. 기동에서 막는다.
			throw new IllegalStateException(
					"app.posture.detector=%s 인데 그런 판정기가 등록되지 않았습니다. 사용할 수 있는 값: %s".formatted(defaultKey,
							byKey.keySet()));
		}
		log.info("자세 판정기 {}종 등록: {} (기본값 {})", byKey.size(), byKey.keySet(), defaultKey);
	}

	/** 등록된 판정기 전부. 키 순으로 고정된다. */
	public List<PostureDetector> all() {
		return List.copyOf(byKey.values());
	}

	public PostureDetector defaultDetector() {
		return defaultDetector;
	}

	/**
	 * 요청이 지정한 판정기를 찾는다. 지정하지 않았으면 기본값을 쓴다.
	 *
	 * <p>
	 * 모르는 키는 기본값으로 넘기지 않고 400으로 막는다. 넘겨 버리면 비교 실험 중에 오타 하나로 계속 기본 판정기가 돌면서도 화면에는
	 * 아무 표시가 없어, 실험이 끝난 뒤에야 알게 된다.
	 *
	 * @param key 요청 본문의 판정기 키. null이거나 빈 문자열이면 기본값
	 */
	public PostureDetector resolve(String key) {
		if (key == null || key.isBlank()) {
			return defaultDetector;
		}
		PostureDetector detector = byKey.get(key);
		if (detector == null) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"알 수 없는 판정기입니다: '%s'. 사용할 수 있는 값: %s".formatted(key, byKey.keySet()));
		}
		return detector;
	}
}
