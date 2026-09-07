package com.protractor.backend.domain.studytag.service;

import com.protractor.backend.domain.studytag.dto.StudyTagResponse;
import com.protractor.backend.domain.studytag.repository.StudyTagRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 스터디 태그(카테고리) 조회 서비스.
 *
 * <p>
 * study_tags는 회원 관심사·방 카테고리 공용 고정 목록이다. 여기서는 방 개설 드롭다운·방찾기 필터에 쓰도록 활성 목록만 내려준다.
 */
@Service
@RequiredArgsConstructor
public class StudyTagService {

	private final StudyTagRepository studyTagRepository;

	/** 활성(enabled) 태그를 id 정렬순으로 조회한다. */
	@Transactional(readOnly = true)
	public List<StudyTagResponse> getAll() {
		return StudyTagResponse.listFrom(studyTagRepository.findAllByEnabledTrueOrderByIdAsc());
	}
}
