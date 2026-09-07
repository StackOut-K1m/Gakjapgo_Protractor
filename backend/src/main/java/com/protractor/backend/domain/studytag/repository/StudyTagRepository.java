package com.protractor.backend.domain.studytag.repository;

import com.protractor.backend.domain.studytag.entity.StudyTag;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StudyTagRepository extends JpaRepository<StudyTag, Long> {

    List<StudyTag> findAllByEnabledTrueOrderByIdAsc();

    List<StudyTag> findAllByIdInAndEnabledTrue(Collection<Long> ids);
}
