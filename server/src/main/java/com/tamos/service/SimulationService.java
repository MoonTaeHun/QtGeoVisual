package com.tamos.service;

import com.tamos.entity.SimulationLog;
import com.tamos.repository.SimulationLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import java.time.LocalDateTime;

@Service
public class SimulationService {

    @Autowired
    private SimulationLogRepository repository;

    // @Async를 사용하여 클라이언트에게는 즉시 응답을 주고, 생성은 백그라운드에서 수행합니다.
    @Async
    public void startSimulation(String objectId, double startLat, double startLon, double endLat, double endLon, int steps) {
        double latStep = (endLat - startLat) / steps;
        double lonStep = (endLon - startLon) / steps;

        for (int i = 0; i <= steps; i++) {
            SimulationLog log = new SimulationLog();
            log.setObjectId(objectId);
            log.setLatitude(startLat + (latStep * i));
            log.setLongitude(startLon + (lonStep * i));
            log.setSpeed(60.0);
            log.setTimestamp(LocalDateTime.now());

            repository.save(log); // DB에 1초 간격으로 한 점씩 저장

            try {
                Thread.sleep(25); // 1초 대기
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }
}
