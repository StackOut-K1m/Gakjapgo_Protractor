package com.protractor.backend.domain.calibration.repository;

import com.protractor.backend.domain.calibration.entity.Calibration;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** 자세 기준선 조회. member_id에 UNIQUE가 걸려 있어 회원당 최대 1건이다. */
public interface CalibrationRepository extends JpaRepository<Calibration, Long> {

	Optional<Calibration> findByMemberId(Long memberId);
}
