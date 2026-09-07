package com.protractor.backend.domain.member.repository;

import com.protractor.backend.domain.member.entity.Member;
import com.protractor.backend.domain.member.entity.Provider;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberRepository extends JpaRepository<Member, Long> {

    Optional<Member> findByEmail(String email);

    boolean existsByEmail(String email);

    Optional<Member> findByProviderAndProviderId(Provider provider, String providerId);
}
