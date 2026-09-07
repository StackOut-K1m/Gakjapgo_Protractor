package com.protractor.backend.domain.studyroom.entity;

/** 스터디룸 상태. 공식 스키마 study_rooms.status ENUM과 매핑된다. */
public enum RoomStatus {
	WAITING, // 개설 후 대기
	RUNNING, // 진행 중
	ENDED // 종료
}
