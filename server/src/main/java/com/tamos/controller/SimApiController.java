package com.tamos.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tamos.service.SimulationService;
import com.tamos.entity.SimulationLog;
import com.tamos.repository.SimulationLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import com.fasterxml.jackson.core.type.TypeReference;

import java.io.File;
import java.util.*;

@RestController
@RequestMapping("/api/sim")
@CrossOrigin(origins = "*")
public class SimApiController {

    @Autowired
    private SimulationService simulationService;

    @Autowired
    private SimulationLogRepository repository;

    // 1. 시뮬레이션 시작 (데이터 생성)
    @GetMapping("/start")
    public String start() {
        // 서울역 -> 시청역 가상 좌표
        simulationService.startSimulation("Tamos-Vehicle-01", 37.5546, 126.9706, 37.5663, 126.9779, 1000);
        return "Simulation Data Generated!";
    }

    // 2. 현재 DB에 쌓인 모든 위치 데이터 가져오기 (지도/테이블 표시용)
    @GetMapping("/data")
    public List<SimulationLog> getAllData() {
        return repository.findAll();
    }

    // 가장 최근 로그 1개만 가져오도록 쿼리 메서드 활용
    @GetMapping("/latest")
    public SimulationLog getLatestData() {
        // ID 역순으로 정렬하여 가장 위(최신)의 레코드 1개만 가져옵니다.
        return repository.findTopByOrderByIdDesc();
    }

    @DeleteMapping("/reset")
    public String resetDatabase() {
        repository.deleteAll(); // 모든 데이터 삭제
        return "Database Cleared!";
    }

    @GetMapping("/od-data")
    public List<Map<String, Object>> getPassengerOdData() {
        List<Map<String, Object>> trips = new ArrayList<>();
        Random random = new Random(); // java.util.Random 필요

        double[][] centers = {
                {127.0276, 37.4979},
                {126.9770, 37.5700},
                {126.9245, 37.5271},
                {126.9240, 37.5568}
        };

        for (int i = 0; i < 200; i++) {
            int startIdx = random.nextInt(centers.length);
            int endIdx = random.nextInt(centers.length);
            while (startIdx == endIdx) endIdx = random.nextInt(centers.length);

            double startLon = centers[startIdx][0] + (random.nextDouble() - 0.5) * 0.05;
            double startLat = centers[startIdx][1] + (random.nextDouble() - 0.5) * 0.05;
            double endLon = centers[endIdx][0] + (random.nextDouble() - 0.5) * 0.05;
            double endLat = centers[endIdx][1] + (random.nextDouble() - 0.5) * 0.05;

            int startTime = random.nextInt(500);
            int duration = 150 + random.nextInt(100);

            Map<String, Object> trip = new HashMap<>();
            trip.put("path", new double[][]{{startLon, startLat}, {endLon, endLat}});
            trip.put("timestamps", new int[]{startTime, startTime + duration});

            if (endIdx == 0) trip.put("color", new int[]{255, 51, 102});
            else trip.put("color", new int[]{0, 204, 255});

            trips.add(trip);
        }
        return trips;
    }

    @GetMapping("/real-od")
    public List<Map<String, Object>> getRealRoutingOdData() {
        ObjectMapper mapper = new ObjectMapper();

        // 데이터베이스 역할을 할 로컬 JSON 파일 경로 지정 (프로젝트 최상단에 생성됨)
        File cacheFile = new File("osrm_routes_cache.json");

        // ==========================================
        // 1. DB (캐시 파일) 조회: 데이터가 존재하면 즉시 리턴!
        // ==========================================
        if (cacheFile.exists()) {
            try {
                System.out.println("⚡ DB에서 저장된 실도로 궤적 데이터를 불러옵니다.");
                // JSON 파일을 다시 List<Map> 형태로 변환하여 즉시 반환
                return mapper.readValue(cacheFile, new TypeReference<List<Map<String, Object>>>() {});
            } catch (Exception e) {
                System.out.println("캐시 파일 읽기 에러 (새로 생성합니다): " + e.getMessage());
            }
        }

        // ==========================================
        // 2. DB에 데이터가 없으면 OSRM API 호출 진행
        // ==========================================
        System.out.println("🔍 저장된 데이터가 없습니다. OSRM API 실도로 탐색을 시작합니다... (약 2~3초 소요)");
        List<Map<String, Object>> trips = new ArrayList<>();
        RestTemplate restTemplate = new RestTemplate();
        Random random = new Random();

        double[][] centers = {
                {127.0276, 37.4979}, {126.9770, 37.5700}, {126.9245, 37.5271}, {126.9240, 37.5568}
        };

        // 테스트용 20대 탐색 (차량 수를 50대, 100대로 늘려도 한 번만 고생하면 됩니다!)
        for (int i = 0; i < 20; i++) {
            int startIdx = random.nextInt(centers.length);
            int endIdx = random.nextInt(centers.length);
            while (startIdx == endIdx) endIdx = random.nextInt(centers.length);

            double startLon = centers[startIdx][0] + (random.nextDouble() - 0.5) * 0.03;
            double startLat = centers[startIdx][1] + (random.nextDouble() - 0.5) * 0.03;
            double endLon = centers[endIdx][0] + (random.nextDouble() - 0.5) * 0.03;
            double endLat = centers[endIdx][1] + (random.nextDouble() - 0.5) * 0.03;

            String url = String.format("http://router.project-osrm.org/route/v1/driving/%f,%f;%f,%f?geometries=geojson",
                    startLon, startLat, endLon, endLat);
            try {
                ResponseEntity<String> response = restTemplate.getForEntity(url, String.class);
                JsonNode root = mapper.readTree(response.getBody());
                JsonNode coordinates = root.path("routes").get(0).path("geometry").path("coordinates");

                List<double[]> pathCoords = new ArrayList<>();
                List<Integer> timestamps = new ArrayList<>();
                int currentTime = random.nextInt(100);

                for (JsonNode coord : coordinates) {
                    pathCoords.add(new double[]{coord.get(0).asDouble(), coord.get(1).asDouble()});
                    timestamps.add(currentTime);
                    currentTime += 3;
                }

                Map<String, Object> trip = new HashMap<>();
                trip.put("path", pathCoords);
                trip.put("timestamps", timestamps);

                // Java 8 호환 Arrays.asList 사용
                if (endIdx == 0) trip.put("color", Arrays.asList(255, 51, 102));
                else trip.put("color", Arrays.asList(0, 204, 255));

                trips.add(trip);
                Thread.sleep(100); // 매너 딜레이
            } catch (Exception e) {
                System.out.println("OSRM 에러: " + e.getMessage());
            }
        }

        // ==========================================
        // 3. 탐색 완료 후 결과를 DB (JSON 파일)에 저장
        // ==========================================
        try {
            mapper.writeValue(cacheFile, trips);
            System.out.println("💾 탐색 완료! 결과를 'osrm_routes_cache.json'에 영구 저장했습니다.");
        } catch (Exception e) {
            System.out.println("캐시 저장 실패: " + e.getMessage());
        }

        return trips;
    }
}
