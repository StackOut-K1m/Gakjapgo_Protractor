package com.protractor.backend.global.openvidu;

import io.openvidu.java.client.Connection;
import io.openvidu.java.client.ConnectionProperties;
import io.openvidu.java.client.ConnectionType;
import io.openvidu.java.client.OpenVidu;
import io.openvidu.java.client.OpenViduHttpException;
import io.openvidu.java.client.OpenViduJavaClientException;
import io.openvidu.java.client.OpenViduRole;
import io.openvidu.java.client.Session;
import io.openvidu.java.client.SessionProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * OpenVidu(화상/음성 서버) 연동.
 *
 * 백엔드 역할은 두 가지다. 방마다 OpenVidu 세션을 확보하고, 참여자용 접속 토큰을 발급한다. 실제 영상 릴레이는 OpenVidu가 하며
 * 영상은 서버로 오지 않는다. 세션 id는 roomId로부터 만들기 때문에(customSessionId) 별도 DB 컬럼이 필요 없다.
 *
 * 주소, 비밀키는 환경에 따라 달라지므로 설정에서 주입받는다. 개발용 openvidu-dev 이미지는 http로 서비스하므로 URL도 http로
 * 맞춰야 한다.
 */
@Service
public class OpenViduService {

	private final OpenVidu openVidu;

	public OpenViduService(@Value("${app.openvidu.url}") String url, @Value("${app.openvidu.secret}") String secret) {
		this.openVidu = new OpenVidu(url, secret);
	}

	/**
	 * 세션을 확보하고 참여자 접속 토큰을 발급한다. 실패는 호출한 쪽에서 응답 코드로 변환한다.
	 *
	 * <p>
	 * 토큰은 받은 그대로 내보낸다. 접속 주소가 토큰 문자열 안에 들어 있는데, OpenVidu는 발급한 문자열 전체로 접속을 검증하기
	 * 때문에 스킴이나 호스트를 고쳐 보내면 입장이 거부된다. 브라우저가 붙을 주소는 OpenVidu 쪽 설정으로 맞춘다.
	 */
	public String issueToken(String openviduSessionId) throws OpenViduJavaClientException, OpenViduHttpException {
		Session session = getOrCreateSession(openviduSessionId);
		ConnectionProperties properties = new ConnectionProperties.Builder().type(ConnectionType.WEBRTC)
				.role(OpenViduRole.PUBLISHER) // 캠/마이크 송출 가능 역할
				.build();
		Connection connection = session.createConnection(properties);
		return connection.getToken();
	}

	/**
	 * customSessionId로 세션을 만들고, 이미 있으면 기존 세션을 가져온다.
	 *
	 * 두 번째 참여자부터는 세션이 이미 존재해 409가 오는데, 이는 정상 흐름이므로 오류로 처리하지 않고 재사용한다.
	 */
	private Session getOrCreateSession(String openviduSessionId)
			throws OpenViduJavaClientException, OpenViduHttpException {
		try {
			SessionProperties properties = new SessionProperties.Builder().customSessionId(openviduSessionId).build();
			return openVidu.createSession(properties);
		} catch (OpenViduHttpException e) {
			if (e.getStatus() == 409) {
				openVidu.fetch();
				return openVidu.getActiveSession(openviduSessionId);
			}
			throw e;
		}
	}
}
