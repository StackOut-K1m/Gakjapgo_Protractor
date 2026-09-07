package com.protractor.backend.domain.stretching.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.protractor.backend.domain.stretching.entity.Stretching;

//Repository를 만들고 Spring Data JPA가 인터페이스를 보고 실제 구현체를 자동으로 만들어 준다.
//어떤 Entity를 다룰지 결정해 주면된다.
//나는 Stretching Entity를 다루는 Repository다.
//그리고 Stretching의 PK 타입은 Long이다.
//findById(Long id)
//findAll()
//save(Stretching entity)
//delete(Stretching entity)
//existsById(Long id)
//위에 기능을 다룰수 있게 된다.
public interface StretchingRepository extends JpaRepository<Stretching, Long> {
	// enabled가 true인 것만 찾고 sortOrder 오름차순으로 정렬하고 id 오름차순으로 한 번 더 정렬해라
	List<Stretching> findByEnabledTrueOrderBySortOrderAscIdAsc();
}
