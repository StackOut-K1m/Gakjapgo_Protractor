package com.protractor.backend.domain.report.storage;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;

/**
 * 리포트 보관소를 하나 고른다. 버킷이 설정돼 있으면 S3, 비어 있으면 로컬 디스크다.
 *
 * <p>
 * 조건부 애너테이션 대신 이 안에서 직접 분기하는 이유는, 어느 보관소가 떴는지 기동 로그로 확실히 남기고
 * 버킷이 없을 때 {@link S3Client} 를 아예 만들지 않기 위해서다. 클라이언트를 만들면 자격증명·리전을 찾으려
 * 하므로, 자격증명 없는 개발 환경에서 기동이 흔들릴 수 있다.
 */
@Slf4j
@Configuration
public class ReportStorageConfig {

    @Bean
    public ReportStorage reportStorage(
            @Value("${app.report.storage-dir}") String storageDir,
            @Value("${app.report.s3.bucket:}") String bucket,
            @Value("${app.report.s3.region:}") String region,
            @Value("${app.report.s3.key-prefix:reports}") String keyPrefix) {

        if (bucket == null || bucket.isBlank()) {
            log.info("리포트 PDF 를 로컬 디스크에 보관합니다: {} (S3 를 쓰려면 app.report.s3.bucket 을 지정하세요)",
                    storageDir);
            return new LocalReportStorage(storageDir);
        }

        S3ClientBuilder builder = S3Client.builder();
        // 리전을 비워 두면 SDK 가 환경변수·설정파일·인스턴스 메타데이터에서 찾는다.
        if (region != null && !region.isBlank()) {
            builder.region(Region.of(region));
        }
        log.info("리포트 PDF 를 S3 에 보관합니다: s3://{}/{}", bucket, keyPrefix);
        return new S3ReportStorage(builder.build(), bucket, keyPrefix);
    }
}
