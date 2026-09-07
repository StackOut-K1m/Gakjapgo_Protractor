package com.protractor.backend.domain.ranking.service;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Redis가 비어 있는 새 컨테이너는 즉시 복구하고, 이후에는 매일 06:00에만 갱신한다. */
@Component
public class RankingSnapshotScheduler {

    private final RankingService rankingService;

    public RankingSnapshotScheduler(RankingService rankingService) {
        this.rankingService = rankingService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void rebuildMissingOnStartup() {
        rankingService.rebuildMissingSnapshots();
    }

    @Scheduled(cron = "0 0 6 * * *", zone = "Asia/Seoul")
    public void rebuildAtSixInTheMorning() {
        rankingService.rebuildAllSnapshots();
    }
}
