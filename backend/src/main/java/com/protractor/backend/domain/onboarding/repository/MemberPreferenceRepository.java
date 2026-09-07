package com.protractor.backend.domain.onboarding.repository;

import com.protractor.backend.domain.onboarding.entity.MemberPreference;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberPreferenceRepository extends JpaRepository<MemberPreference, Long> {
}
