package com.protractor.backend.domain.report.storage;

import java.time.LocalDate;
import java.util.Optional;

/**
 * 생성된 리포트 PDF 의 보관소.
 *
 * <p>
 * 구현이 둘인 이유는 자격증명 없이도 개발이 되어야 하기 때문이다. S3 버킷이 설정돼 있으면
 * {@link S3ReportStorage}, 비어 있으면 {@link LocalReportStorage} 가 뜬다({@link ReportStorageConfig}).
 *
 * <p>
 * 반환하는 위치 문자열은 {@code reports.pdf_url} 컬럼에 그대로 저장되며, 나중에 {@link #load(String)}·
 * {@link #exists(String)} 에 다시 넘어온다. 그래서 어느 보관소가 만든 값인지 문자열만 보고 알 수 있어야 한다
 * (S3 는 {@code s3://버킷/키}, 로컬은 파일 경로).
 */
public interface ReportStorage {

    /**
     * PDF 를 보관하고 위치 문자열을 돌려준다.
     *
     * @param memberId 회원별로 폴더를 나누는 데 쓴다
     * @param reportId 파일 이름에 쓴다
     * @param from 리포트 기간 시작일 — 파일 이름에 넣어 어느 주차인지 바로 보이게 한다
     * @param to 리포트 기간 종료일
     */
    String store(Long memberId, Long reportId, LocalDate from, LocalDate to, byte[] pdf);

    /**
     * 보관 파일 이름. 두 구현이 같은 규칙을 쓰도록 여기 모아 둔다.
     *
     * <p>
     * 기간을 앞에 두는 이유는 두 가지다. S3 콘솔이나 파일 목록에서 어느 주차 리포트인지 열지 않고
     * 알 수 있고, ISO 날짜라 이름 정렬이 그대로 시간순 정렬이 된다.
     *
     * <p>
     * reportId 를 남겨 두는 이유: 같은 기간을 다시 생성하면(이전 건이 지워졌거나 파일이 사라진 경우)
     * 새 행이 생기는데, 이름에 id 가 없으면 예전 파일을 덮어써서 그 행의 pdf_url 이 가리키는 대상이
     * 바뀐다.
     */
    static String fileName(Long reportId, LocalDate from, LocalDate to) {
        return "%s_%s_report-%d.pdf".formatted(from, to, reportId);
    }

    /** 보관된 PDF 를 읽는다. 위치가 비었거나 파일이 없으면 {@link Optional#empty()}. */
    Optional<byte[]> load(String location);

    /**
     * 그 위치에 파일이 아직 있는지.
     *
     * <p>
     * 같은 기간의 완료된 리포트를 재사용할지 판단할 때 쓴다. DB 행만 믿고 재사용하면, 파일이 사라진 경우
     * 사용자는 다운로드 404 에서 막히고 다시 생성할 방법이 없다.
     */
    boolean exists(String location);
}
