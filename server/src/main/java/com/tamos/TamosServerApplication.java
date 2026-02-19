package com.tamos;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@EnableAsync
@SpringBootApplication // 이 어노테이션이 모든 자동 설정을 담당합니다
public class TamosServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(TamosServerApplication.class, args);
    }
}
