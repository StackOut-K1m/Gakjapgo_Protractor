package com.protractor.backend.domain.notification.service;

import com.protractor.backend.domain.notification.dto.NotificationSettingsResponse;
import com.protractor.backend.domain.notification.dto.NotificationSettingsUpdateRequest;
import com.protractor.backend.domain.notification.entity.MemberNotificationSettings;
import com.protractor.backend.domain.notification.repository.MemberNotificationSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class MemberNotificationSettingsService {

    private final MemberNotificationSettingsRepository repository;

    @Transactional(readOnly = true)
    public NotificationSettingsResponse get(Long memberId) {
        return repository.findById(memberId).map(NotificationSettingsResponse::from)
                .orElseGet(NotificationSettingsResponse::defaults);
    }

    @Transactional
    public NotificationSettingsResponse update(Long memberId, NotificationSettingsUpdateRequest request) {
        MemberNotificationSettings settings = repository.findById(memberId)
                .orElseGet(() -> MemberNotificationSettings.defaults(memberId));
        settings.update(request.friendEnabled(), request.dmEnabled(), request.communityEnabled(),
                request.inquiryEnabled(), request.noticeEnabled(), request.reportEnabled(), request.rankingEnabled());
        return NotificationSettingsResponse.from(repository.save(settings));
    }
}
