package com.protractor.backend.domain.onboarding.entity;

import java.io.Serializable;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** member_purposes 복합키(member_id + purpose). JPA @IdClass 규약상 기본 생성자와 equals/hashCode가 필요하다. */
@Getter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class MemberPurposeId implements Serializable {

    private Long memberId;
    private String purpose;
}
