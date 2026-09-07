package com.protractor.backend.domain.notification.repository;

import com.protractor.backend.domain.notification.entity.MemberNotificationSettings;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberNotificationSettingsRepository extends JpaRepository<MemberNotificationSettings, Long> {
}
