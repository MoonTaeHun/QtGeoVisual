# QtGeoVisual
A high-performance Mapbox GL native rendering project using C++, Qt/QML, and MinGW.

1. 프로젝트 아키텍처 및 데이터 흐름

지도의 변경 가능성에 대비하여 데이터(JSON)와 렌더링(Map Engine)을 완전히 분리한 구조입니다.

1-1. Backend (Java/Spring Boot + MySQL):
	
	* DB: 시뮬레이션 경로(A-B)와 객체의 실시간 위치 데이터를 관리합니다.
	
	* Logic: A에서 B까지의 이동 경로를 계산하고, 주기적으로 위치를 갱신(Update)합니다.

1-2. Client (Qt/QML):
	
	* Native UI: 하단이나 측면에 **데이터 테이블(TableView)**을 배치하여 실시간 수치를 보여줍니다.

	* Map Container: WebEngineView를 통해 지도를 띄웁니다.

1-3. Visualization (Web/Mapbox):

	* REST API로 받은 좌표를 지도 위 커스텀 아이콘으로 렌더링하고 애니메이션을 수행합니다.

2. 프로젝트 폴더 구조
```
tamos/
├── server/                         	# Java Backend
│   ├── src/main/java/com/tamos/
│   │   ├── controller/             	# REST API (Get Data, Start Sim)
│   │   ├── service/                	# A to B 경로 계산 및 시뮬레이션 로직
│   │   ├── repository/             	# JPA (MySQL 연동)
│   │   └── entity/                 	# SimulationData, Route 객체
│   └── src/main/resources/         	# application.yml (DB/CORS 설정)
└── client/                         	# Qt/C++ Client
    └── tamos-client/
        ├── main.cpp
        ├── CMakeLists.txt
        ├── src/                    	# C++ Bridge (Table Model)
        ├── qml/
        │   └── main.qml            	# 전체 레이아웃 (Map + Table)
        └── mapweb/                 	# Map Assets (JS/HTML)
            ├── index.html          	# 지도 진입점
            ├── js/
            │   ├── map_adapter.js  	# 공통 지도 인터페이스
            │   ├── engine_mapbox.js 	# Mapbox 전용 구현
            │   └── animation.js    	# 객체 이동 애니메이션 로직
            └── css/
                └── style.css

```
cpp, qt6, qml, mapbox-gl, opengl, rendering
