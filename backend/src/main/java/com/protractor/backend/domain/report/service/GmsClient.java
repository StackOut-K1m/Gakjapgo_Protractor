package com.protractor.backend.domain.report.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * SSAFY GMS(LLM 게이트웨이) 클라이언트. OpenAI 호환 chat/completions API를 그대로 쓴다.
 * 리포트 비동기 스레드에서만 호출되므로 느려도 사용자 요청을 붙잡지 않는다.
 */
@Component
public class GmsClient {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String baseUrl;
    private final String model;
    private final String apiKey;
    private final int maxTokens;
    private final double temperature;

    public GmsClient(@Qualifier("gmsRestClient") RestClient gmsRestClient,
            ObjectMapper objectMapper,
            @Value("${app.gms.base-url}") String baseUrl,
            @Value("${app.gms.model}") String model,
            @Value("${app.gms.api-key}") String apiKey,
            @Value("${app.gms.max-tokens}") int maxTokens,
            @Value("${app.gms.temperature}") double temperature) {
        this.restClient = gmsRestClient;
        this.objectMapper = objectMapper;
        this.baseUrl = baseUrl;
        this.model = model;
        this.apiKey = apiKey;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
    }

    public String model() {
        return model;
    }

    /**
     * 소견 마크다운 생성. 온도·토큰 상한은 설정값이며 기본은 AI 파트 프로토타입을 따른다.
     *
     * <p>
     * 상한에 걸려 잘린 응답은 성공으로 취급하지 않는다. 소견은 뒤쪽 절(개선 권고·관찰 포인트)이
     * 잘려도 앞부분은 그럴듯해 보여서, 그냥 저장하면 반쪽 리포트가 정상처럼 배포된다.
     */
    public String generateOpinion(String systemPrompt, String userPrompt) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("GMS_API_KEY가 설정되지 않았습니다. 환경변수를 확인하세요.");
        }

        Map<String, Object> body = Map.of(
                "model", model,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userPrompt)),
                "temperature", temperature,
                "max_tokens", maxTokens);

        // 게이트웨이를 거치며 응답 Content-Type이 어긋나는 경우가 있어(octet-stream 등)
        // 타입 변환을 스프링 컨버터에 맡기지 않고 문자열로 받아 직접 파싱한다.
        String raw = restClient.post()
                .uri(baseUrl + "/chat/completions")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(String.class);

        JsonNode response;
        try {
            response = objectMapper.readTree(raw);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("GMS 응답이 JSON이 아닙니다: "
                    + (raw != null && raw.length() > 200 ? raw.substring(0, 200) : raw));
        }

        JsonNode content = response.at("/choices/0/message/content");
        if (content == null || content.isMissingNode() || content.asText().isBlank()) {
            throw new IllegalStateException("GMS 응답에서 소견 텍스트를 찾지 못했습니다.");
        }

        // finish_reason=length 는 상한에 걸려 중간에 끊긴 것이다. 조용히 넘기면 문장이 잘린
        // 리포트가 COMPLETED 로 남는다.
        String finishReason = response.at("/choices/0/finish_reason").asText("");
        if ("length".equals(finishReason)) {
            throw new IllegalStateException(
                    "소견이 토큰 상한에 걸려 잘렸습니다. app.gms.max-tokens 를 늘리세요 (현재 " + maxTokens + ").");
        }
        return content.asText();
    }
}
