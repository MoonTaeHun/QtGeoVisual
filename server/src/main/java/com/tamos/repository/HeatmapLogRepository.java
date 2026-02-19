package com.tamos.repository;

import com.tamos.entity.HeatmapLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HeatmapLogRepository extends JpaRepository<HeatmapLog, Long> {
    // JpaRepository를 상속받는 것만으로도 findAll(), saveAll() 등의 기본 DB 명령이 활성화됩니다.
}
