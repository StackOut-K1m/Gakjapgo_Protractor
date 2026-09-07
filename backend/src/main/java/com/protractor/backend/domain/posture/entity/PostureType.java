package com.protractor.backend.domain.posture.entity;

/**
 * 감지 대상 자세. 서로 독립적으로 판정되며 동시에 여러 개가 검출될 수 있다.
 *
 * <p>
 * 서버가 판정하는 것은 앞의 2종이고, 그 2종이 모두 정상일 때만 바른 자세다. 각 항목은 자기 임계값과 자기 30초 윈도우를
 * 따로 갖는다. CHIN_REST는 브라우저가 판정해 보내오는 값이라 이 규칙 밖에 있다.
 *
 * <p>
 * events 테이블에는 (body_part, detail) 두 값으로 저장된다. body_part만으로는 어깨 자세를 구분할 수 없으므로
 * detail을 반드시 채운다.
 */
public enum PostureType {

	/** 거북목. 귀가 어깨보다 앞으로 나온 각도로 판정한다. */
	FORWARD_HEAD("NECK", "FORWARD_HEAD", false),

	/** 어깨 높낮이. 좌우 어깨의 높이 차이로 판정한다. */
	SHOULDER_TILT("SHOULDER", "SHOULDER_TILT", true),

	/**
	 * 턱 괴기. 손목이 턱 근처에 있고 팔꿈치가 책상에 내려가 있는 것으로 판정한다.
	 *
	 * <p>
	 * 위 셋과 달리 <b>서버가 판정하지 않는다.</b> 손목·팔꿈치 좌표가 PostureFeatures v1에 없고, v1은 동결돼 있어
	 * 필드를 늘리면 기존 캘리브레이션 기준선이 전부 무효가 되기 때문이다. 브라우저가 확정한 뒤 posture-checks로 보낸다.
	 * 따라서 이 값은 detect() 결과에는 절대 나타나지 않고, 저장·집계 경로에서만 쓰인다.
	 */
	CHIN_REST("NECK", "CHIN_REST", false);

	private final String bodyPart;
	private final String detail;
	private final boolean rotationSensitive;

	PostureType(String bodyPart, String detail, boolean rotationSensitive) {
		this.bodyPart = bodyPart;
		this.detail = detail;
		this.rotationSensitive = rotationSensitive;
	}

	/** events.body_part 값. */
	public String bodyPart() {
		return bodyPart;
	}

	/** events.detail 값. 자세 종류를 구분하는 유일한 키다. */
	public String detail() {
		return detail;
	}

	/**
	 * 몸통이 회전하면 지표가 무너지는 자세인지.
	 *
	 * <p>
	 * 어깨 폭과 좌우 어깨 높이는 몸을 틀기만 해도 변해서 회전과 나쁜 자세를 구분할 수 없다. 반면 거북목은 오히려 옆에서 볼수록 잘
	 * 보이므로 회전에 영향을 받지 않는다.
	 */
	public boolean isRotationSensitive() {
		return rotationSensitive;
	}
}
