const mapManager = {
    shapeManager: new ShapeManager(),
    currentAdapter: null,
    containerId: '',

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
            // 그리기 완료 시 Model에 저장 후 전체 화면 갱신
            onShapeDrawn: (type, geometry) => {
                // 1. 중앙 데이터 저장소(Model)에 추가
                this.shapeManager.addShape(type, geometry);

                // 2. 화면 갱신 (View)
                this.currentAdapter.renderAll(this.shapeManager.getAllData());

                // [핵심 추가] 3. C++(로컬 DB)로 데이터 동기화 요청
                this.syncToHost();
                console.log("자동 저장 실행됨!");
            },
            // 지도 로딩 완료 시 최초 1회 전체 렌더링
            onReady: () => {
                this.loadFromHost();
                this.currentAdapter.renderAll(this.shapeManager.getAllData());
                console.log("DB 데이터 로드 및 초기 렌더링 완료");
            }
        });
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
    }
};
