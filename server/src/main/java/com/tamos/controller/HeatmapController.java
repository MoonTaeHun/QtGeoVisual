package com.tamos.controller;

import com.tamos.entity.HeatmapLog;
import com.tamos.repository.HeatmapLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

@RestController
@CrossOrigin(origins = "*")
@RequestMapping("/api/heatmap")
public class HeatmapController {

    @Autowired
    private HeatmapLogRepository heatmapRepository;

    // 1. [DB 저장용 API] 호출 시 서울 시내 랜덤 좌표 500개를 DB에 Insert 합니다.
    @PostMapping("/generate")
    public ResponseEntity<String> generateRandomDataToDB() {
        // 기존 데이터가 있다면 깔끔하게 지우고 시작 (TRUNCATE 효과)
        heatmapRepository.deleteAll();

        List<HeatmapLog> randomLogs = new ArrayList<>();
        Random random = new Random();

        double minLat = 37.45, maxLat = 37.65;
        double minLng = 126.80, maxLng = 127.15;

        for (int i = 0; i < 500; i++) {
            double lat = minLat + (maxLat - minLat) * random.nextDouble();
            double lng = minLng + (maxLng - minLng) * random.nextDouble();
            int weight = random.nextInt(100) + 1;

            randomLogs.add(new HeatmapLog(lat, lng, weight, LocalDateTime.now()));
        }

        // DB에 500개 데이터 일괄 저장 (INSERT INTO heatmap_logs ...)
        heatmapRepository.saveAll(randomLogs);

        return ResponseEntity.ok("500개의 랜덤 히트맵 데이터가 DB에 성공적으로 생성되었습니다.");
    }

    // 2. [DB 조회용 API] Qt 클라이언트가 호출하면 DB에서 데이터를 꺼내서 반환합니다.
    @GetMapping("/data")
    public ResponseEntity<List<HeatmapLog>> getHeatmapDataFromDB() {
        // DB에 저장된 모든 히트맵 로그를 가져옵니다. (SELECT * FROM heatmap_logs)
        List<HeatmapLog> logs = heatmapRepository.findAll();

        return ResponseEntity.ok(logs);
    }
}
