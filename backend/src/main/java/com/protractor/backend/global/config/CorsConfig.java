package com.protractor.backend.global.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 프론트엔드와 백엔드가 서로 다른 origin에서 실행될 때 필요한 CORS 설정.
 *
 * Docker에서는 frontend가 localhost:5173, backend가 localhost:8080으로 노출되므로 브라우저 보안
 * 정책을 통과하기 위해 허용 origin을 명시해야 한다.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

	private final String[] allowedOrigins;

	// 허용할 프론트 주소는 환경변수(CORS_ALLOWED_ORIGINS)로 주입받는다. 쉼표로 여러 개 지정 가능.
	public CorsConfig(@Value("${app.cors.allowed-origins:http://localhost:5173}") String allowedOrigins) {
		this.allowedOrigins = StringUtils.commaDelimitedListToStringArray(allowedOrigins);
	}

	@Override
	public void addCorsMappings(CorsRegistry registry) {
		registry.addMapping("/api/**").allowedOrigins(allowedOrigins)
				.allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS").allowedHeaders("*")
				.allowCredentials(true).maxAge(3600);
	}
}
