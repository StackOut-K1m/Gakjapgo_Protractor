package com.protractor.backend.domain.posture.service;

import com.protractor.backend.domain.posture.dto.PostureBaseline;
import com.protractor.backend.domain.posture.dto.PostureFeatures;
import com.protractor.backend.domain.posture.dto.PostureResult;
import com.protractor.backend.domain.posture.entity.PostureType;
import java.util.List;

/**
 * 자세 판정기. 피처 벡터 한 프레임을 받아 3종 자세를 각각 판정한다.
 *
 * <p>
 * 이 인터페이스가 판정 방식을 갈아 끼우는 유일한 지점이다. 앞으로 비교할 방식이 모두 여기를 구현한다.
 *
 * <ul>
 * <li>규칙 기반(구현 완료) — 관절 각도·거리를 직접 계산. 학습이 필요 없다
 * <li>하이브리드(구현 완료) — 같은 피처 벡터를 가벼운 머신러닝 모델에 넣어 분류
 * <li>이미지 학습(예정) — 프레임 이미지를 그대로 신경망에 넣어 분류
 * </ul>
 *
 * <p>
 * 모든 구현체가 같은 입력({@link PostureFeatures})과 같은 출력({@link PostureResult})을 쓰기 때문에,
 * 구현체를 바꿔도 30초 윈도우 판정·이벤트 저장·점수 계산은 그대로 재사용된다. 정확도 비교도 같은 조건에서 할 수 있다.
 *
 * <p>
 * <b>새 방식을 추가할 때 고칠 곳은 이 인터페이스의 구현체 하나뿐이다.</b> 빈으로 등록되기만 하면
 * {@link PostureDetectorRegistry}가 자동으로 주워 목록에 넣고, 브라우저의 선택 버튼도 그 목록을 받아 그리므로 프론트엔드는
 * 손대지 않아도 된다.
 */
public interface PostureDetector {

	/**
	 * API·설정에서 이 판정기를 가리키는 짧은 키. 예: {@code rule-based}, {@code hybrid}.
	 *
	 * <p>
	 * {@link #name()}과 나누는 이유는 수명이 다르기 때문이다. 이름은 {@code hybrid-logistic-v1}처럼 판정
	 * 버전이 올라가면 같이 바뀌어야 events 기록에서 세대를 구분할 수 있다. 반면 키는 요청 본문과 설정 파일이 쓰는 값이라 바뀌면 클라이언트가
	 * 깨진다.
	 */
	String key();

	/** 판정기 이름. 어떤 방식으로 판정했는지 events.metadata에 남겨 비교 실험에 쓴다. */
	String name();

	/** 화면의 선택 버튼에 띄울 한 줄 설명. 새 방식을 추가해도 프론트를 고치지 않으려고 서버가 내려준다. */
	String description();

	/**
	 * 한 프레임을 판정한다.
	 *
	 * @param features 브라우저가 정규화해 보낸 피처 벡터
	 * @param baseline 이 회원의 캘리브레이션 기준선. 판정은 절대값이 아니라 이 기준선 대비 편차로 한다
	 * @return 3종 판정 결과. 신뢰할 수 없는 항목은 보류 상태로 담긴다
	 */
	PostureResult detect(PostureFeatures features, PostureBaseline baseline);

	/**
	 * 기준선 없이 이 프레임만 판정한다. 캘리브레이션 전(입장 준비화면) 전용이다.
	 *
	 * <p>
	 * 왜 필요한가: 기준 자세를 등록하는 그 순간이야말로 자세가 바라야 하는데, 그때는 아직 기준선이 없다.
	 * {@link #detect}에 null을 넘기면 전부 NO_BASELINE 보류가 되어 "지금 자세가 나쁜지"를 물어볼 방법이 없었고, 그래서
	 * 거북목인 채로 기준선을 등록해도 통과했다. 그러면 세션 내내 그 자세가 "정상"이 된다.
	 *
	 * <p>
	 * 30초 윈도우도 이벤트 저장도 거치지 않는다. 이탈 각도는 채우지 않는다 — 각도는 기준선 대비로만 뜻이 있는 값이다.
	 *
	 * <p>
	 * 기본 구현은 "판정할 수 없다"고 답한다. 기준선 대비 편차로만 판정하는 방식(규칙 기반)은 캘리브레이션 전에 할 수 있는 말이 없기
	 * 때문이다. 절대 기준을 학습한 모델을 가진 구현체만 재정의한다. 보류로 답해도 화면은 그냥 지금처럼 동작한다 — 자세를 못 막는 것이지
	 * 고장나는 것이 아니다.
	 */
	default PostureResult preview(PostureFeatures features) {
		return new PostureResult(name(),
				List.of(PostureResult.Judgement.skipped(PostureType.FORWARD_HEAD, "NO_BASELINE"),
						PostureResult.Judgement.skipped(PostureType.SHOULDER_TILT, "NO_BASELINE")));
	}
}
