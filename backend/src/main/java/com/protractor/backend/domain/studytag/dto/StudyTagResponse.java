package com.protractor.backend.domain.studytag.dto;

import com.protractor.backend.domain.studytag.entity.StudyTag;
import java.util.List;

public record StudyTagResponse(
        Long studyTagId,
        String name
) {
    public static StudyTagResponse from(StudyTag studyTag) {
        return new StudyTagResponse(studyTag.getId(), studyTag.getName());
    }

    public static List<StudyTagResponse> listFrom(List<StudyTag> studyTags) {
        return studyTags.stream().map(StudyTagResponse::from).toList();
    }
}
