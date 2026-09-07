package com.protractor.backend.domain.dm.repository;
import com.protractor.backend.domain.dm.entity.DmRoom; import java.util.*; import org.springframework.data.jpa.repository.JpaRepository;
public interface DmRoomRepository extends JpaRepository<DmRoom,Long>{ Optional<DmRoom> findByMemberIdLowAndMemberIdHigh(Long low,Long high); List<DmRoom> findByMemberIdLowOrMemberIdHigh(Long low,Long high); }
