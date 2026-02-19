package com.tamos.controller;

import com.tamos.service.SimulationService;
import com.tamos.entity.SimulationLog;
import com.tamos.repository.SimulationLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.List;

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
}
