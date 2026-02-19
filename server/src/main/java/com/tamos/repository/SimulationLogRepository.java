package com.tamos.repository;

import com.tamos.entity.SimulationLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SimulationLogRepository extends JpaRepository<SimulationLog, Long> {
    // [추가] 가장 최신 로그 1개만 가져오는 쿼리 메서드
    // SimulationLog 엔티티의 ID 필드명이 logId인 경우입니다.
    SimulationLog findTopByOrderByIdDesc();
}
