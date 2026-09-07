package com.protractor.backend.global.config;

import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class RestClientConfig {

    // 소셜(OAuth) 서버 응답 지연이 우리 요청 스레드를 무기한 붙잡지 않도록 타임아웃을 강제한다.
    @Bean
    public RestClient oauthRestClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(5));
        return RestClient.builder().requestFactory(factory).build();
    }

    // GMS(LLM)는 소견 생성에 수십 초가 걸릴 수 있어 OAuth용(5초)과 분리해 읽기 타임아웃을 길게 둔다.
    // 리포트 비동기 스레드에서만 쓰므로 사용자 요청 응답 시간에는 영향이 없다.
    @Bean
    public RestClient gmsRestClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(90));
        return RestClient.builder().requestFactory(factory).build();
    }
}
