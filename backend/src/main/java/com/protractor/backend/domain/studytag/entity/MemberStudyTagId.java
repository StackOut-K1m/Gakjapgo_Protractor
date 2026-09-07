package com.protractor.backend.domain.studytag.entity;

import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** member_study_tags 복합키(member_id + study_tag_id). JPA @IdClass 규약상 기본 생성자와 equals/hashCode가 필요하다. */
@Getter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class MemberStudyTagId implements Serializable {

    private Long memberId;
    private Long studyTagId;
}
