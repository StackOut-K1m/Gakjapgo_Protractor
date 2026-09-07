package com.protractor.backend.global.config;

import com.protractor.backend.global.security.JwtAuthenticationFilter;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    // CorsConfig(WebMvcConfigurer)와 같은 값을 쓴다. Security 필터 단계에서도 CORS가 적용되어야 preflight가 통과한다.
    @Value("${app.cors.allowed-origins}")
    private List<String> allowedOrigins;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .formLogin(formLogin -> formLogin.disable())
                .httpBasic(httpBasic -> httpBasic.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // 로그아웃/비밀번호 변경은 access token으로 본인 확인이 필요하다.
                        // permitAll인 /api/v1/auth/** 보다 먼저 선언해야 적용된다. (/auth/password/find는 비로그인용이라 제외)
                        .requestMatchers("/api/v1/auth/logout", "/api/v1/auth/password").authenticated()
                        .requestMatchers(
                                "/api/v1/auth/**",
                                "/actuator/health",
                                "/openvidu-test.html",
                                "/ws-test.html",
                                "/ws/**",
                                "/swagger-ui.html",
                                "/swagger-ui/**",
                                "/v3/api-docs/**"
                        ).permitAll()
                        // 홈 "방 찾기"는 비로그인도 목록·상세를 볼 수 있어야 한다(랜딩 화면).
                        // GET만 공개, 입장/생성/수정/삭제 등은 인증 유지. "/study-rooms/*"는 상세({roomId})만 매칭.
                        .requestMatchers(HttpMethod.GET, "/api/v1/study-rooms", "/api/v1/study-rooms/*").permitAll()
                        // 카테고리(태그) 목록은 방찾기 필터·개설 드롭다운에 쓰이므로 비로그인도 조회 허용.
                        .requestMatchers(HttpMethod.GET, "/api/v1/study-tags").permitAll()
                        // 비로그인 홈의 "지금 공부 중" 숫자. 개인을 특정할 수 있는 값은 담지 않는다.
                        .requestMatchers(HttpMethod.GET, "/api/v1/public/**").permitAll()
                        // 커뮤니티 게시판·이벤트는 비로그인도 읽을 수 있다(GET만 공개).
                        // 1:1 문의(INQUIRY)의 본인 확인과 쓰기 권한은 BoardService가 검사한다.
                        .requestMatchers(HttpMethod.GET, "/api/v1/boards/**").permitAll()
                        .anyRequest().authenticated()
                )
                .exceptionHandling(exception -> exception
                        .authenticationEntryPoint((request, response, authException) -> {
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.setCharacterEncoding("UTF-8");
                            response.getWriter().write("{\"status\":401,\"message\":\"인증이 필요합니다.\"}");
                        })
                        .accessDeniedHandler((request, response, accessDeniedException) -> {
                            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            response.setCharacterEncoding("UTF-8");
                            response.getWriter().write("{\"status\":403,\"message\":\"접근 권한이 없습니다.\"}");
                        })
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(allowedOrigins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
