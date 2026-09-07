package com.protractor.backend.domain.notification.service;

import com.protractor.backend.domain.member.entity.AccountStatus;
import com.protractor.backend.domain.notification.entity.Notification;
import com.protractor.backend.domain.notification.entity.NotificationType;
import com.protractor.backend.domain.notification.repository.MemberNotificationSettingsRepository;
import com.protractor.backend.domain.notification.repository.NotificationRepository;
import com.protractor.backend.domain.notification.repository.NotificationTargetQueryRepository;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주간 리포트 안내 알림 발송. 매주 월요일 00:00(KST)에 "지난주 리포트가 준비됐어요"를 보낸다.
 *
 * <p>
 * 리포트를 미리 만들어 두고 알리는 게 아니다 — 리포트 생성(LLM 호출)은 지금처럼 사용자가 상세 페이지에서
 * 요청할 때 하고, 이 알림은 확인 유도만 한다. summary(그래프·수치)는 LLM 없이 즉시 조회되므로
 * 알림만으로도 화면이 의미 있다. 자동 생성으로 바꾸려면 회원 수만큼 LLM 비용이 들어 팀 결정이 먼저다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ReportNotificationScheduler {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter PERIOD = DateTimeFormatter.ofPattern("M/d");

    private final NotificationTargetQueryRepository targetQueryRepository;
    private final MemberNotificationSettingsRepository settingsRepository;
    private final NotificationRepository notificationRepository;

    // cron을 설정으로 뺀 이유: 실제 발송은 월요일 00:00 한 번뿐이라, 스모크에서 짧은 주기로 덮어써야
    // 발송·중복 방지를 그날까지 기다리지 않고 확인할 수 있다.
    @Scheduled(cron = "${app.notification.report-cron}", zone = "Asia/Seoul")
    @Transactional
    public void sendWeeklyReportNotifications() {
        // 지난주 월~일. 어느 요일에 실행돼도(스모크 포함) 같은 주를 가리키도록 이번 주 월요일 기준으로 계산한다.
        // FE utils/week.ts의 lastWeekRange와 같은 규칙이다.
        LocalDate thisMonday = LocalDate.now(KST).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate lastMonday = thisMonday.minusWeeks(1);
        // 학습 기록은 학습일(DATE)로 자른다. 자정을 넘긴 공부는 서버가 날짜별로 나눠 저장한다.
        List<Long> studied = targetQueryRepository.findActiveMembersStudiedBetween(lastMonday, thisMonday,
                AccountStatus.ACTIVE);
        if (studied.isEmpty()) {
            log.info("리포트 안내 알림: 지난주({}~{}) 학습 기록이 있는 회원이 없어 발송하지 않습니다.", lastMonday,
                    thisMonday.minusDays(1));
            return;
        }

        // 수신 설정에서 리포트 알림을 끈 회원 제외. 설정 행이 없으면 수신이 기본 정책이다.
        Set<Long> optedOut = new HashSet<>();
        settingsRepository.findAllById(studied).forEach(settings -> {
            if (!settings.isReportEnabled()) {
                optedOut.add(settings.getMemberId());
            }
        });

        // 이번 주에 이미 보낸 회원 제외(중복 발송 방지 — 서버 재시작으로 스케줄이 다시 돌아도 안전).
        Set<Long> alreadyNotified = new HashSet<>(notificationRepository.findReceiverIdsNotifiedSince(
                NotificationType.REPORT, thisMonday.atStartOfDay(), studied));

        String title = "주간 리포트 도착";
        String message = PERIOD.format(lastMonday) + " ~ " + PERIOD.format(thisMonday.minusDays(1))
                + " 주간 리포트가 준비되었어요. 지금 확인해 보세요.";
        List<Notification> notifications = studied.stream()
                .filter(memberId -> !optedOut.contains(memberId) && !alreadyNotified.contains(memberId))
                .map(memberId -> Notification.weeklyReport(memberId, title, message))
                .toList();
        notificationRepository.saveAll(notifications);

        log.info("리포트 안내 알림 발송: 대상 {}명 중 {}건 발송 (수신 거부 {}명, 기발송 {}명)", studied.size(),
                notifications.size(), optedOut.size(), alreadyNotified.size());
    }
}
