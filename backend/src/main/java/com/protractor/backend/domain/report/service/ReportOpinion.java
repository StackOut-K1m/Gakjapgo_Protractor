package com.protractor.backend.domain.report.service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * LLM 소견 마크다운을 "그래프별 판독"과 "나머지 소견"으로 가른다.
 *
 * <p>
 * 판독 문단을 그래프 바로 아래에 붙이려면 어느 문단이 몇 번 그래프의 것인지 알아야 한다. 프롬프트가
 * {@code ## 0. 그래프 판독} 아래에 {@code ### 그래프 1:} 형태의 소제목을 쓰도록 지시하고, 여기서 그 제목을
 * 기준으로 잘라낸다.
 *
 * <p>
 * LLM 이 형식을 벗어날 수 있으므로 실패를 정상 경로로 둔다 — 못 찾으면 판독은 비고 원문은 그대로 남아
 * 소견 페이지에 통째로 렌더된다. 문장을 잃지는 않는다.
 */
public record ReportOpinion(List<String> chartNotes, String restMarkdown) {

    /** {@code ## 0. …} 절 전체. 다음 {@code ## }(2단계) 제목 직전까지. */
    private static final Pattern SECTION_ZERO = Pattern.compile(
            "(?m)^##\\s*0\\..*?(?=^##\\s(?!#)|\\z)", Pattern.DOTALL);

    /**
     * {@code ### 그래프 1: …} 소제목. 제목 단계와 번호만 보고, 번호 뒤 구분자는 따지지 않는다.
     *
     * <p>
     * 구분자를 문자 클래스로 열거하지 않는 이유: 콜론·마침표·대시·가운뎃점 등 LLM 이 쓰는 종류가 다양하고,
     * 클래스 안의 대시가 범위 기호로 해석될 여지도 있다. {@code (?![0-9])} 는 "그래프 12" 를 1 로 읽는 것을 막는다.
     */
    private static final Pattern CHART_HEADING = Pattern.compile(
            "(?m)^#{2,4}\\s*그래프\\s*([1-9])(?![0-9])[^\\n]*\\n");

    private static final int CHART_COUNT = 4;

    public static ReportOpinion parse(String markdown) {
        if (markdown == null || markdown.isBlank()) {
            return new ReportOpinion(List.of(), markdown == null ? "" : markdown);
        }

        Matcher section = SECTION_ZERO.matcher(markdown);
        if (!section.find()) {
            return new ReportOpinion(List.of(), markdown);
        }

        String zero = section.group();
        List<String> notes = extractNotes(zero);
        if (notes.isEmpty()) {
            // 절은 있는데 소제목을 못 읽었다. 원문을 건드리지 않고 소견 페이지에 그대로 남긴다.
            return new ReportOpinion(List.of(), markdown);
        }

        // 판독 절은 그래프 아래로 옮겨 실었으므로 소견 본문에서는 뺀다(같은 문장이 두 번 나오지 않게).
        String rest = new StringBuilder(markdown)
                .delete(section.start(), section.end())
                .toString()
                .stripLeading();
        return new ReportOpinion(notes, rest);
    }

    /** 소제목 사이의 본문을 그래프 번호 순서대로 모은다. 번호가 빠지면 그 자리는 빈 문자열이다. */
    private static List<String> extractNotes(String sectionZero) {
        String[] byIndex = new String[CHART_COUNT];
        Matcher heading = CHART_HEADING.matcher(sectionZero);

        int lastIndex = -1;
        int bodyStart = -1;
        while (heading.find()) {
            if (lastIndex >= 0) {
                store(byIndex, lastIndex, sectionZero.substring(bodyStart, heading.start()));
            }
            lastIndex = Integer.parseInt(heading.group(1)) - 1;
            bodyStart = heading.end();
        }
        if (lastIndex >= 0) {
            store(byIndex, lastIndex, sectionZero.substring(bodyStart));
        }

        List<String> notes = new ArrayList<>(Collections.nCopies(CHART_COUNT, ""));
        boolean any = false;
        for (int i = 0; i < CHART_COUNT; i++) {
            if (byIndex[i] != null) {
                notes.set(i, byIndex[i]);
                any = true;
            }
        }
        return any ? notes : List.of();
    }

    private static void store(String[] target, int index, String body) {
        if (index < 0 || index >= target.length) {
            return;
        }
        String trimmed = body.strip();
        if (!trimmed.isEmpty()) {
            target[index] = trimmed;
        }
    }

    /** {@code index} 번 그래프의 판독. 없으면 null. */
    public String noteFor(int index) {
        if (index < 0 || index >= chartNotes.size()) {
            return null;
        }
        String note = chartNotes.get(index);
        return note == null || note.isBlank() ? null : note;
    }
}
