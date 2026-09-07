package com.protractor.backend.global.security;

import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.repository.MemberRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private static final String AUTHORIZATION_HEADER = "Authorization";
	private static final String BEARER_PREFIX = "Bearer ";

	private final JwtTokenProvider jwtTokenProvider;
	private final MemberRepository memberRepository;

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
			throws ServletException, IOException {
		String token = resolveToken(request);

		// refresh 토큰(typ=refresh)으로는 API 인증이 되지 않도록 access 토큰만 통과시킨다.
		if (token != null && jwtTokenProvider.validateToken(token) && jwtTokenProvider.isAccessToken(token)) {
			Long memberId = jwtTokenProvider.getMemberId(token);

			// 탈퇴/정지 회원은 아직 만료되지 않은 access 토큰도 여기서 즉시 무력화한다.
			// JWT만 믿으면 계정 상태가 바뀌어도 토큰 만료(최대 1시간)까지 API를 쓸 수 있기 때문이다.
			// 비용은 요청당 PK 단건 조회 1회. 문제가 되면 짧은 TTL 캐시로 줄일 수 있다.
			boolean active = memberRepository.findById(memberId).map(Member::isActive).orElse(false);

			if (active) {
				String role = jwtTokenProvider.getRole(token);
				UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(memberId,
						null, List.of(new SimpleGrantedAuthority("ROLE_" + role)));
				SecurityContextHolder.getContext().setAuthentication(authentication);
			}
		}

		filterChain.doFilter(request, response);
	}

	private String resolveToken(HttpServletRequest request) {
		String bearerToken = request.getHeader(AUTHORIZATION_HEADER);
		if (StringUtils.hasText(bearerToken) && bearerToken.startsWith(BEARER_PREFIX)) {
			return bearerToken.substring(BEARER_PREFIX.length());
		}
		return null;
	}
}
