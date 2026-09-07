package com.protractor.backend.domain.posture.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * events.metadata에 저장하는 판정 근거 스냅샷.
 *
 * <p>
 * calibrations는 회원당 1행이라 재캘리브레이션하면 기존 기준선이 사라진다. 기준선을 남기지 않으면 "이 경고가 어떤 기준으로 나왔는가"를
 * 나중에 확인할 수 없고, 그러면 판정 방식 3종(규칙·하이브리드·이미지)의 정확도를 같은 조건에서 비교할 수 없다.
 *
 * <p>
 * 그래서 이벤트를 만들 때 <b>판정에 실제로 쓴 기준선과 그 순간의 피처</b>를 함께 박아둔다. 이 값이 있으면 나중에 같은 입력을 다른
 * 판정기에 넣어 결과를 맞대볼 수 있다.
 *
 * @param detectorName 어떤 판정기가 냈는지(rule-based-v1 등)
 * @param featureVersion 피처 벡터 규격 버전
 * @param baseline 판정에 쓴 기준선
 * @param features 확정 시점의 피처 값
 * @param maxSeverity 30초 윈도우에서 관측된 가장 높은 심각도
 */
@Schema(description = "자세 이벤트 판정 근거 스냅샷")
public record PostureEventMetadata(String detectorName, String featureVersion, PostureBaseline baseline,
		PostureFeatures features, int maxSeverity) {
}
