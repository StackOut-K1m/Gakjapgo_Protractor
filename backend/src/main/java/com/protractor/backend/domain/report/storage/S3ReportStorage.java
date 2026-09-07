package com.protractor.backend.domain.report.storage;

import java.time.LocalDate;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * S3 보관소. 회원별로 폴더를 나눠 {@code <prefix>/member-<memberId>/report-<reportId>.pdf} 로 올린다.
 *
 * <p>
 * 위치 문자열은 {@code s3://버킷/키} 형태로 남긴다. 버킷을 함께 적어 두면 나중에 버킷이 바뀌어도 예전 행이
 * 어디를 가리키는지 알 수 있고, 로컬 경로와 한눈에 구분된다.
 *
 * <p>
 * 다운로드는 백엔드가 바이트를 받아 전달한다(프록시). presigned URL 로 바꾸면 트래픽은 줄지만, 남의 리포트
 * 접근을 막는 검사가 서버를 거치지 않게 되고 프론트도 blob 대신 리다이렉트를 다루도록 고쳐야 한다.
 */
@Slf4j
@RequiredArgsConstructor
public class S3ReportStorage implements ReportStorage {

    private static final String SCHEME = "s3://";

    private final S3Client s3Client;
    private final String bucket;
    private final String keyPrefix;

    @Override
    public String store(Long memberId, Long reportId, LocalDate from, LocalDate to, byte[] pdf) {
        // 접두사를 비워 두면 키가 "/member-…" 로 시작해 이름 없는 폴더가 생긴다. 빈 접두사는 생략한다.
        String prefix = trimSlashes(keyPrefix);
        String key = (prefix.isEmpty() ? "" : prefix + "/")
                + "member-%d/%s".formatted(memberId, ReportStorage.fileName(reportId, from, to));
        s3Client.putObject(PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType("application/pdf")
                .build(), RequestBody.fromBytes(pdf));
        log.info("리포트 PDF 업로드 완료: s3://{}/{} ({} bytes)", bucket, key, pdf.length);
        return SCHEME + bucket + "/" + key;
    }

    @Override
    public Optional<byte[]> load(String location) {
        String key = extractKey(location);
        if (key == null) {
            return Optional.empty();
        }
        try {
            ResponseBytes<GetObjectResponse> object = s3Client
                    .getObjectAsBytes(GetObjectRequest.builder().bucket(bucketOf(location)).key(key).build());
            return Optional.of(object.asByteArray());
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        }
    }

    @Override
    public boolean exists(String location) {
        String key = extractKey(location);
        if (key == null) {
            return false;
        }
        try {
            s3Client.headObject(HeadObjectRequest.builder().bucket(bucketOf(location)).key(key).build());
            return true;
        } catch (S3Exception e) {
            // HEAD 는 응답 본문이 없어 404 가 NoSuchKeyException 으로 매핑되지 않는 SDK 조합이 있고,
            // s3:ListBucket 권한이 없으면 없는 키에 404 대신 403 이 온다. 이 메서드는 "완료본을
            // 재사용해도 되는가"의 판단에만 쓰이므로, 어느 쪽이든 재사용하지 않는 쪽이 안전하다 —
            // 여기서 예외를 흘리면 생성 요청 자체가 500 으로 죽는다.
            if (e.statusCode() != 404) {
                log.warn("S3 존재 확인 실패({}) — 재사용하지 않고 새로 생성합니다: {}", e.statusCode(), location);
            }
            return false;
        }
    }

    /**
     * {@code s3://버킷/키} 에서 키를 꺼낸다.
     *
     * <p>
     * 로컬 보관소로 만들어진 예전 행(파일 경로)이 넘어올 수 있으므로 형식이 다르면 null 을 돌려준다. 그러면
     * 호출부는 "파일 없음"으로 보고, 사용자는 리포트를 다시 생성해 S3 로 옮기게 된다.
     */
    private String extractKey(String location) {
        if (location == null || !location.startsWith(SCHEME)) {
            return null;
        }
        int slash = location.indexOf('/', SCHEME.length());
        if (slash < 0 || slash == location.length() - 1) {
            return null;
        }
        return location.substring(slash + 1);
    }

    private String bucketOf(String location) {
        int slash = location.indexOf('/', SCHEME.length());
        return location.substring(SCHEME.length(), slash);
    }

    private String trimSlashes(String value) {
        return value.replaceAll("^/+|/+$", "");
    }
}
