package com.tamos.entity;

import lombok.Getter;
import lombok.Setter;
import javax.persistence.*;
import java.time.LocalDateTime;

@Entity
@Getter @Setter
@Table(name = "heatmap_logs") // MySQL에 생성될 테이블 이름
public class HeatmapLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Double lat;
    private Double lng;
    private Integer weight;
    private LocalDateTime timestamp; // 기록 시간

    // 기본 생성자, Getter, Setter
    public HeatmapLog() {}

    public HeatmapLog(Double lat, Double lng, Integer weight, LocalDateTime timestamp) {
        this.lat = lat;
        this.lng = lng;
        this.weight = weight;
        this.timestamp = timestamp;
    }
}
