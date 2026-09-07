package com.protractor.backend.domain.studytag.controller;

import com.protractor.backend.domain.studytag.dto.StudyTagResponse;
import com.protractor.backend.domain.studytag.service.StudyTagService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "StudyTag", description = "스터디 태그(카테고리) API")
@RestController
@RequestMapping("/api/v1/study-tags")
@RequiredArgsConstructor
public class StudyTagController {

	private final StudyTagService studyTagService;

	@Operation(summary = "카테고리(태그) 목록 조회", description = "활성 study_tags를 정렬순으로 반환한다. 방 개설 카테고리 드롭다운·방찾기 필터에 사용한다. 비로그인도 조회 가능.")
	@GetMapping
	public List<StudyTagResponse> getAll() {
		return studyTagService.getAll();
	}
}
