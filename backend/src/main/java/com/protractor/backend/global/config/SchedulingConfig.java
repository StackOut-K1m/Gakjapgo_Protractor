package com.protractor.backend.global.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** @Scheduled 활성화. 현재 사용처는 주간 리포트 안내 알림(ReportNotificationScheduler)뿐이다. */
@Configuration
@EnableScheduling
public class SchedulingConfig {
}
