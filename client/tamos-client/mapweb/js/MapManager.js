window.mapManager = {
    shapeManager: new ShapeManager(),
    currentAdapter: null,
    containerId: '',
    tempGeoJsonData: null,
    statsGeoJsonData: null,
    statsHeightKey: null,
    is3DMode: false,

    init: function(containerId, center) {
        this.containerId = containerId;
        this.switchEngine('mapbox', center); // 초기엔진 설정
    },

    switchEngine: function(engineType, forceCenter = null) {
        // 기본 뷰 상태 (Mapbox 줌 14 기준)
        let viewState = {
            center: forceCenter || { lat: 37.5546, lng: 126.9706 },
            zoom: 14 
        };

        if (this.currentAdapter) {
            // 기존 엔진에서 중심 좌표와 줌 레벨을 모두 가져옵니다.
            if (typeof this.currentAdapter.getCurrentViewState === 'function') {
                viewState = this.currentAdapter.getCurrentViewState();
                viewState.zoom = Math.round(viewState.zoom * 2) / 2;
            }
            
            // 초기화 시 forceCenter가 넘어왔다면 중심 좌표만 덮어씌움
            if (forceCenter) viewState.center = forceCenter;
            
            this.currentAdapter.destroy(); //
        }

        this.currentAdapter = engineType === 'kakao' ? new KakaoAdapter() : new MapboxAdapter();

        // 어댑터 초기화 및 콜백 연결
        this.currentAdapter.init(this.containerId, viewState, {
            onLoad: () => {
                // 1. 기존 사용자가 그린 도형 및 마커 복구 (기존에 있던 코드)
                if (typeof this.currentAdapter.renderAll === 'function') {
                    this.currentAdapter.renderAll(this.shapeManager.getAllData());
                }

                // 2. [신규 추가] 통계 폴리곤 데이터가 메모리에 남아있다면, 새 엔진에 맞춰서 다시 그려줌!
                if (this.statsGeoJsonData && this.statsHeightKey) {
                    if (typeof this.currentAdapter.render3DGeoJson === 'function') {
                        this.currentAdapter.render3DGeoJson(this.statsGeoJsonData, this.statsHeightKey);
                        if (engineType === 'mapbox') this.is3DMode = true;
                    }
                }

                if (engineType === 'mapbox' && this.is3DMode && typeof this.currentAdapter.set3DMode === 'function') {
                    this.currentAdapter.set3DMode(true);
                }
            },
            // 그리기 완료 시 Model에 저장 후 전체 화면 갱신
            onShapeDrawn: (type, geometry) => {
                if (type === 'marker') {
                    // [수정] 마커일 경우 바로 저장하지 않고 C++에 텍스트 입력 요청
                    if (window.mapBridge) {
                        // 경도(lng), 위도(lat) 순서로 보냄
                        console.log("connected mapBridge");
                        window.mapBridge.onMarkerPositionSelected(
                            geometry.coordinates[1], 
                            geometry.coordinates[0],
                            function() { console.log("C++ 슬롯 호출 완료"); }
                        );
                    }
                } else {
                    // 다른 도형들은 기존처럼 즉시 저장
                    this.shapeManager.addShape(type, geometry);
                    this.currentAdapter.renderAll(this.shapeManager.getAllData());
                    this.syncToHost();
                }
            },
            // 지도 로딩 완료 시 최초 1회 전체 렌더링
            onReady: () => {
                this.loadFromHost();
                this.currentAdapter.renderAll(this.shapeManager.getAllData());
                console.log("DB 데이터 로드 및 초기 렌더링 완료");
            }
        });
    },

    addFinalMarkerWithLabel: function(lat, lng, text) {
        const geometry = { coordinates: [lng, lat] };
        const properties = { name: text }; 

        this.shapeManager.addShape('marker', geometry, properties);
        
        if (this.currentAdapter && this.currentAdapter.isLoaded()) {
            this.currentAdapter.renderAll(this.shapeManager.getAllData());
        }
        this.syncToHost();
    },

    // --- C++에서 호출하는 인터페이스 ---
    updateMarker: function(id, lat, lng) {
        // 1. 데이터는 준비 여부와 상관없이 무조건 중앙 저장소(Model)에 저장합니다.
        this.shapeManager.updateMarker(id, lat, lng);
        this.shapeManager.addPathPoint(id, lat, lng);

        // 2. 어댑터가 로드 완료된 상태일 때만 화면 갱신(View)을 지시합니다.
        if (this.currentAdapter && this.currentAdapter.isLoaded()) {
            this.currentAdapter.renderAll(this.shapeManager.getAllData());
        }
    },

    drawHeatmap: function(dataJsonString) {
        const dataArray = typeof dataJsonString === 'string' ? JSON.parse(dataJsonString) : dataJsonString;
        this.shapeManager.setHeatmap(dataArray);

        // 히트맵도 로드 완료 시에만 렌더링
        if (this.currentAdapter && this.currentAdapter.isLoaded()) {
            this.currentAdapter.renderAll(this.shapeManager.getAllData());
        }
    },

    clearHeatmap: function() {
        this.shapeManager.clearHeatmap();
        if (this.currentAdapter) this.currentAdapter.renderAll(this.shapeManager.getAllData());
    },

    startDrawing: function(type) {
        if (this.currentAdapter) this.currentAdapter.startDrawing(type);
    },

    stopDrawing: function() {
        if (this.currentAdapter) this.currentAdapter.stopDrawing();
    },

    // 호스트(C++)로부터 데이터를 읽어와서 ShapeManager에 주입
    loadFromHost: function() {
        if (window.mapBridge) {
            // 결과를 반환받기 위해 콜백 함수(function(jsonString))를 인자로 넣습니다.
            window.mapBridge.loadUserShapes(function(jsonString) {
                if (!jsonString) return; // 데이터가 없으면 무시

                try {
                    // C++에서 데이터가 도착하면 이 블록이 실행됩니다.
                    const savedShapes = JSON.parse(jsonString);

                    if (savedShapes && savedShapes.length > 0) {
                        mapManager.shapeManager.shapes = savedShapes;
                        console.log(`${savedShapes.length}개의 도형을 DB에서 불러왔습니다.`);

                        // 데이터를 다 불러온 후에 화면에 렌더링을 지시해야 합니다.
                        if (mapManager.currentAdapter && mapManager.currentAdapter.isLoaded()) {
                            mapManager.currentAdapter.renderAll(mapManager.shapeManager.getAllData());
                        }
                    }
                } catch (e) {
                    console.error("JSON 파싱 에러 (DB 데이터가 비어있거나 깨졌습니다):", e);
                }
            });
        } else {
            console.warn("mapBridge 객체를 찾을 수 없습니다.");
        }
    },

    // 현재 그려진 모든 데이터를 C++로 내보내기
    syncToHost: function() {
        if (window.mapBridge) {
            const allShapes = mapManager.shapeManager.getAllShapes();
            const jsonString = JSON.stringify(allShapes);

            // 빈 콜백 함수를 추가하여 WebChannel이 자동으로 통신 id를 생성하게 만듭니다.
            window.mapBridge.saveUserShapes(jsonString, function() {
                // 이 블록은 C++에서 m_assetManager->saveShapes()가 무사히 끝나면 실행됩니다.
                console.log("C++ 호스트 DB에 저장 완료 응답 받음!");
            });

        } else {
            console.warn("mapBridge 객체를 찾을 수 없어 0.5초 후 재시도합니다.");
            setTimeout(() => this.syncToHost(), 500);
        }
    },

    // 1. QML(runJavaScript) -> JS: 전달받은 문자열 분석
    analyzeGeoJson: function(geojsonString) {
        try {
            const data = JSON.parse(geojsonString);
            this.tempGeoJsonData = data;

            let keys = new Set();
            // 모든 피처(Feature)의 properties 안의 키(Key)들을 수집
            if (data.features) {
                data.features.forEach(f => {
                    if (f.properties) {
                        Object.keys(f.properties).forEach(k => keys.add(k));
                    }
                });
            }

            // 추출한 키들을 배열로 변환하여 C++로 전달 (JS -> C++)
            if (window.mapBridge) {
                // [수정] WebChannel이 통신 ID를 생성할 수 있도록 마지막 인자에 빈 콜백 함수를 추가합니다.
                window.mapBridge.reportGeoJsonKeys(Array.from(keys), function() {
                    console.log("C++로 키 목록 전송 완료 및 ID 생성 성공!");
                });
            }
        } catch (e) {
            console.error("GeoJSON 분석 에러:", e);
            alert("유효한 GeoJSON 파일이 아닙니다.");
        }
    },

    // 2. QML(runJavaScript) -> JS: 사용자가 선택한 키(Key)로 매핑하여 지도에 렌더링
    applyGeoJsonMapping: function(selectedKey) {
        if (!this.tempGeoJsonData || !this.tempGeoJsonData.features) return;

        this.tempGeoJsonData.features.forEach(f => {
            const geom = f.geometry;
            if (!geom) return;

            // 일단 Point(마커) 데이터에 대해서만 테스트 적용
            if (geom.type === 'Point') {
                // 사용자가 선택한 Key를 이용해 properties에서 텍스트를 빼옵니다.
                const mappedText = f.properties[selectedKey] || "이름없음";
                const lng = geom.coordinates[0];
                const lat = geom.coordinates[1];

                // [수정 핵심] 기존 properties 데이터를 모두 복사하고, 표출할 name 속성만 덮어씌웁니다.
                const mergedProperties = Object.assign({}, f.properties, { name: mappedText });
                
                // ShapeManager에 추가
                this.shapeManager.addShape('marker', 
                    { coordinates: [lng, lat] }, 
                    mergedProperties
                );
            } else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
                hasPolygons = true;
            }
        });

        // 폴리곤 데이터가 있다면 어댑터의 3D 렌더링 특수 함수 호출
        if (hasPolygons) {
            this.statsGeoJsonData = this.tempGeoJsonData;
            this.statsHeightKey = selectedKey;
        }

        // [수정] 1. 기존 마커와 도형을 먼저 렌더링합니다. (여기서 화면을 한 번 싹 지웁니다)
        if (this.currentAdapter && this.currentAdapter.isLoaded()) {
            this.currentAdapter.renderAll(this.shapeManager.getAllData());
        }

        // [수정] 2. 지워진 도화지 위에 통계 폴리곤을 마지막에 렌더링합니다! (안전하게 생존)
        if (hasPolygons && this.currentAdapter && typeof this.currentAdapter.render3DGeoJson === 'function') {
            this.currentAdapter.render3DGeoJson(this.statsGeoJsonData, this.statsHeightKey);
        }
        
        // 메모리 정리 및 DB 저장
        this.tempGeoJsonData = null;
        this.syncToHost(); 
    },
    
    // 3D 토글 함수: 상태를 전역 변수에 저장하고 어댑터에 전달
    toggle3D: function() {
        this.is3DMode = !this.is3DMode; // 상태 반전
        if (this.currentAdapter && typeof this.currentAdapter.set3DMode === 'function') {
            this.currentAdapter.set3DMode(this.is3DMode);
        }
    },

    // 서버에서 시뮬레이션 데이터를 가져와 3D 플로우 맵을 그리라고 지시
    showSimulationFlow: function(jsonString, layerType) {
        try {
            const data = JSON.parse(jsonString);
            if (data && data.length > 0) {
                if (this.currentAdapter && typeof this.currentAdapter.showSimulationFlow === 'function') {
                    this.currentAdapter.showSimulationFlow(data, layerType);
                }
            } else {
                alert("시뮬레이션 데이터가 없습니다.");
            }
        } catch (e) {
            console.error("플로우 맵 데이터 파싱 에러:", e);
        }
    },

    setAnimationPause: function(paused) {
        try {
            if (this.currentAdapter && typeof this.currentAdapter.setAnimationPause === 'function') {
                this.currentAdapter.setAnimationPause(paused);
            }
        } catch (e) {
            console.error("플로우 맵 데이터 파싱 에러:", e);
        }
    },

    createGridInPolygon(polygonCoords, cellSize, type = 'hex') {
        try {
            if (this.currentAdapter && typeof this.currentAdapter.createGridInPolygon === 'function') {
                this.currentAdapter.createGridInPolygon(polygonCoords, cellSize, type);
            }
        } catch (e) {
            console.error("그리드 맵 데이터 파싱 에러:", e);
        }
    },

    mergeGridByCondition(sourceId) {
        try {
            if (this.currentAdapter && typeof this.currentAdapter.mergeGridByCondition === 'function') {
                this.currentAdapter.mergeGridByCondition(sourceId);
            }
        } catch (e) {
            console.error("그리드 맵 데이터 파싱 에러:", e);
        }
    }
};
