package com.tamos.entity;

import lombok.Getter;
import lombok.Setter;
import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Getter @Setter
@Table(name = "simulation_logs")
public class SimulationLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String objectId;   // 객체 이름 (예: Drone-A)
    private Double latitude;   // 위도
    private Double longitude;  // 경도
    private Double speed;      // 속도
    private LocalDateTime timestamp; // 기록 시간
}
