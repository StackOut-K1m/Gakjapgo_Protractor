package com.protractor.backend.domain.report.storage;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * 서버 로컬 디스크 보관소. S3 버킷이 설정되지 않았을 때 쓴다.
 *
 * <p>
 * 컨테이너를 다시 만들면 파일이 사라지므로 배포에서는 S3 를 써야 한다. 개발 중 자격증명 없이 전체 흐름을
 * 확인할 수 있게 남겨 둔 경로다.
 */
@Slf4j
@RequiredArgsConstructor
public class LocalReportStorage implements ReportStorage {

    private final String storageDir;

    @Override
    public String store(Long memberId, Long reportId, LocalDate from, LocalDate to, byte[] pdf) {
        Path dir = Path.of(storageDir, "member-" + memberId);
        try {
            Files.createDirectories(dir);
            Path path = dir.resolve(ReportStorage.fileName(reportId, from, to));
            Files.write(path, pdf);
            return path.toString();
        } catch (IOException e) {
            throw new UncheckedIOException("리포트 PDF 를 로컬에 저장하지 못했습니다: " + dir, e);
        }
    }

    @Override
    public Optional<byte[]> load(String location) {
        Path path = toPath(location);
        if (path == null || !Files.exists(path)) {
            return Optional.empty();
        }
        try {
            return Optional.of(Files.readAllBytes(path));
        } catch (IOException e) {
            throw new UncheckedIOException("리포트 PDF 를 읽지 못했습니다: " + location, e);
        }
    }

    @Override
    public boolean exists(String location) {
        Path path = toPath(location);
        return path != null && Files.exists(path);
    }

    /**
     * 위치 문자열을 경로로. 파일 경로가 아니면 null.
     *
     * <p>
     * S3 보관소가 남긴 행(s3://…)이 넘어올 수 있다 — S3 를 쓰다 버킷 설정을 빼면 그렇게 된다.
     * Windows 는 경로에 콜론을 허용하지 않아 {@code Path.of("s3://…")} 가 InvalidPathException 을
     * 던지므로, 여기서 걸러 "파일 없음"으로 처리한다(사용자는 다시 생성하면 된다).
     */
    private Path toPath(String location) {
        if (location == null || location.isBlank()) {
            return null;
        }
        try {
            return Path.of(location);
        } catch (InvalidPathException e) {
            log.warn("로컬 보관소가 해석할 수 없는 위치입니다(다른 보관소가 남긴 값): {}", location);
            return null;
        }
    }
}
