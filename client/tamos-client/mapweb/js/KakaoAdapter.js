class KakaoAdapter extends MapAdapter {
    constructor() {
        super();
        this.isReady = false;
        this.map = null;
        this.heatmapInstance = null;
        this.drawingManager = null;
        this.callbacks = null;

        // 렌더링된 객체들을 임시 저장 (초기화용)
        this.renderedShapes = [];
        this.renderedMarkers = {};
        this.renderedPaths = {};
    }

    init(containerId, viewState, callbacks) {
        this.callbacks = callbacks;

        kakao.maps.load(() => {
            const container = document.getElementById(containerId);
            const kakaoLevel = this.getKakaoLevelFromMapboxZoom(viewState.zoom);

            this.map = new kakao.maps.Map(container, {
                center: new kakao.maps.LatLng(viewState.center.lat, viewState.center.lng),
                level: kakaoLevel
            });

            // 히트맵 컨테이너 설정
            this.setupHeatmapContainer(container);

            // 그리기 매니저 설정
            this.drawingManager = new kakao.maps.drawing.DrawingManager({
                map: this.map,
                drawingMode: [
                    kakao.maps.drawing.OverlayType.MARKER,
                    kakao.maps.drawing.OverlayType.CIRCLE,
                    kakao.maps.drawing.OverlayType.RECTANGLE,
                    kakao.maps.drawing.OverlayType.POLYGON
                ]
            });

            // 그리기 완료 이벤트
            this.drawingManager.addListener('drawend', (data) => {
                let geom = null;
                let type = '';

                // [핵심] 억지로 객체를 파싱하지 않고, 카카오가 제공하는 깔끔한 JSON 원본 데이터를 꺼내옵니다.
                const drawnData = this.drawingManager.getData();

                // [신규 추가] 마커를 찍었을 때의 좌표 추출
                if (data.overlayType === kakao.maps.drawing.OverlayType.MARKER) {
                    type = 'marker';
                    const pos = data.target.getPosition();
                    geom = { coordinates: [pos.getLng(), pos.getLat()] }; 
                }
                else if (data.overlayType === kakao.maps.drawing.OverlayType.CIRCLE) {
                    type = 'circle';
                    const center = data.target.getPosition();
                    geom = {
                        center: [center.getLng(), center.getLat()], // [경도, 위도] 순서 유지
                        radius: data.target.getRadius()
                    };
                }
                else if (data.overlayType === kakao.maps.drawing.OverlayType.RECTANGLE) {
                    type = 'rectangle';
                    const rects = drawnData[kakao.maps.drawing.OverlayType.RECTANGLE];
                    if (rects && rects.length > 0) {
                        const last = rects[rects.length - 1];
                        // 좌하단(SW)과 우상단(NE)을 보장하기 위해 min, max 정렬
                        geom = {
                            bbox: [
                                Math.min(last.sPoint.x, last.ePoint.x), Math.min(last.sPoint.y, last.ePoint.y),
                                Math.max(last.sPoint.x, last.ePoint.x), Math.max(last.sPoint.y, last.ePoint.y)
                            ]
                        };
                    }
                }
                else if (data.overlayType === kakao.maps.drawing.OverlayType.POLYGON) {
                    type = 'polygon';
                    const polygons = drawnData[kakao.maps.drawing.OverlayType.POLYGON];
                    if (polygons && polygons.length > 0) {
                        const last = polygons[polygons.length - 1];
                        // 카카오가 내려준 순수 x(경도), y(위도)를 그대로 매핑
                        geom = { coordinates: last.points.map(p => [p.x, p.y]) };
                    }
                }

                // 임시 그리기 오버레이를 지움 (중앙 관리자에서 다시 예쁘게 그려줄 것이므로)
                this.drawingManager.remove(data.target);
                this.stopDrawing();

                // Controller에 전달하여 영구 객체로 재렌더링
                if (geom && this.callbacks && this.callbacks.onShapeDrawn) {
                    this.callbacks.onShapeDrawn(type, geom);
                }
            });

            this.isReady = true; // 준비 완료

            // 초기화 완료 콜백
            if (this.callbacks.onReady) this.callbacks.onReady();
        });
    }

    setupHeatmapContainer(container) {
        this.heatmapContainer = document.createElement('div');
        this.heatmapContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;transition:opacity 0.2s;';
        container.appendChild(this.heatmapContainer);

        const updateHeatmap = () => this.renderHeatmapPositions();
        kakao.maps.event.addListener(this.map, 'drag', updateHeatmap);
        kakao.maps.event.addListener(this.map, 'zoom_changed', updateHeatmap);
        kakao.maps.event.addListener(this.map, 'zoom_start', () => { this.heatmapContainer.style.opacity = '0'; });

        // 1. 공통 그라데이션 설정을 heatmap.js 규격(오브젝트)으로 변환
        let kakaoGradient = {};
        MapStyles.heatmap.gradient.forEach(stop => {
            // 밀도 0.0은 heatmap.js에서 오류를 낼 수 있으므로 제외하거나 미세한 값으로 처리
            if (stop.density > 0) {
                kakaoGradient[stop.density] = stop.color;
            }
        });

        // 2. heatmap.js 설정 객체에 주입
        this.heatmapInstance = h337.create({
            container: this.heatmapContainer, // [주의] document.getElementById(...) 대신 this.heatmapContainer 사용
            radius: MapStyles.heatmap.radius,
            maxOpacity: MapStyles.heatmap.opacity,
            minOpacity: 0,
            blur: .75,
            gradient: kakaoGradient
        });
    }

    getCurrentCenter() {
        if (!this.map) return { lat: 37.5546, lng: 126.9706 };
        const center = this.map.getCenter();
        return { lat: center.getLat(), lng: center.getLng() };
    }

    getCurrentViewState() {
        if (!this.map) return { center: { lat: 37.5546, lng: 126.9706 }, zoom: 14 };
        
        const center = this.map.getCenter();
        const kakaoLevel = this.map.getLevel();
        const standardZoom = this.getMapboxZoomFromKakaoLevel(kakaoLevel);
        
        return { 
            center: { lat: center.getLat(), lng: center.getLng() }, 
            zoom: standardZoom 
        };
    }

    // 1. 맵박스 줌(소수점) -> 카카오 레벨(정수) 변환 테이블
    getKakaoLevelFromMapboxZoom(zoom) {
        // 반올림(round) 대신 내림(floor)이나 올림(ceil)을 섞어 쓰면 줌이 튀는 걸 방지할 수 있습니다.
        // 여기서는 맵박스 줌 14.0~14.99까지는 무조건 카카오 레벨 4로 고정되게 만듭니다.
        return Math.max(1, Math.min(14, 18 - Math.floor(zoom)));
    }

    // 2. 카카오 레벨(정수) -> 맵박스 줌(소수점) 역변환 테이블
    getMapboxZoomFromKakaoLevel(level) {
        const mapping = {
            1: 17.0, 2: 16.0, 3: 15.0, 4: 14.0, 5: 13.0,
            6: 12.0, 7: 11.0, 8: 10.0, 9: 9.0, 10: 8.0,
            11: 7.0, 12: 6.0, 13: 5.0, 14: 4.0
        };
        return mapping[level] || 14.0;
    }

    startDrawing(type) {
        if (!this.drawingManager) return;
        let mode;
        if (type === 'marker') mode = kakao.maps.drawing.OverlayType.MARKER;
        else if (type === 'circle') mode = kakao.maps.drawing.OverlayType.CIRCLE;
        else if (type === 'rectangle') mode = kakao.maps.drawing.OverlayType.RECTANGLE;
        else if (type === 'polygon') mode = kakao.maps.drawing.OverlayType.POLYGON;

        if(mode) this.drawingManager.select(mode);
    }

    stopDrawing() {
        if (this.drawingManager) this.drawingManager.cancel();
    }

    // [핵심] Controller가 주는 데이터를 화면에 뿌림
    renderAll(data) {
        if (!this.map || !this.isReady) return;
        this.clearAll();

        // 1. 도형 렌더링
        data.shapes.forEach(shape => {
            let overlay;
            const style = {
                strokeColor: shape.style.strokeColor,
                strokeWeight: shape.style.strokeWidth,
                fillColor: shape.style.fillColor,
                fillOpacity: shape.style.fillOpacity
            };

            if (shape.type === 'circle') {
                overlay = new kakao.maps.Circle({ map: this.map, center: new kakao.maps.LatLng(shape.geometry.center[1], shape.geometry.center[0]), radius: shape.geometry.radius, ...style });
            } else if (shape.type === 'rectangle') {
                const sw = new kakao.maps.LatLng(shape.geometry.bbox[1], shape.geometry.bbox[0]);
                const ne = new kakao.maps.LatLng(shape.geometry.bbox[3], shape.geometry.bbox[2]);
                overlay = new kakao.maps.Rectangle({ map: this.map, bounds: new kakao.maps.LatLngBounds(sw, ne), ...style });
            } else if (shape.type === 'polygon') {
                const path = shape.geometry.coordinates.map(c => new kakao.maps.LatLng(c[1], c[0]));
                overlay = new kakao.maps.Polygon({ map: this.map, path: path, ...style });
            } else if (shape.type === 'marker') {
                const container = document.createElement('div');
                container.className = 'custom-marker-container';
                // [수정] Mapbox와 동일하게 Flexbox를 사용하여 아이콘과 텍스트를 세로로 예쁘게 정렬합니다.
                container.style.display = 'flex';
                container.style.flexDirection = 'column';  
                container.style.alignItems = 'center';     

                // 1. 아이콘 이미지
                const img = document.createElement('img');
                img.src = (shape.style && shape.style.icon) ? shape.style.icon : MapStyles.marker.defaultIcon;
                // 크기 안전 장치 추가
                const iconWidth = (typeof MapStyles !== 'undefined' && MapStyles.marker && MapStyles.marker.iconSize) ? MapStyles.marker.iconSize[0] : 32;
                const iconHeight = (typeof MapStyles !== 'undefined' && MapStyles.marker && MapStyles.marker.iconSize) ? MapStyles.marker.iconSize[1] : 32;
                img.style.width = iconWidth + 'px';
                img.style.height = iconHeight + 'px';
                container.appendChild(img);

                // 2. 텍스트 라벨 (DB에 저장된 이름이 있을 경우)
                const name = (shape.properties && shape.properties.name) ? shape.properties.name : shape.name;
                if (name) {
                    const label = document.createElement('div');
                    label.innerText = name;
                    // [수정] 가독성을 높이는 텍스트 박스 스타일링 적용
                    label.style.marginTop = '4px'; 
                    label.style.padding = '3px 6px';
                    label.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                    label.style.border = '1px solid #333';
                    label.style.borderRadius = '4px';
                    label.style.fontSize = '12px';
                    label.style.fontWeight = 'bold';
                    label.style.color = '#000';
                    label.style.whiteSpace = 'nowrap';
                    label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
                    
                    container.appendChild(label);
                }

                // 카카오 좌표계(위도, 경도 순)에 맞게 CustomOverlay 생성
                overlay = new kakao.maps.CustomOverlay({
                    position: new kakao.maps.LatLng(shape.geometry.coordinates[1], shape.geometry.coordinates[0]),
                    content: container,
                    map: this.map,
                    yAnchor: 0.5, // 마커 중심축 설정
                    zIndex: 4
                });
            }

            if (overlay) this.renderedShapes.push(overlay);
        });

        // 2. 마커 렌더링
        for (let id in data.markers) {
            const m = data.markers[id];
            const content = document.createElement('div');
            content.className = 'drone-marker';
            const marker = new kakao.maps.CustomOverlay({
                position: new kakao.maps.LatLng(m.lat, m.lng),
                content: content, map: this.map, xAnchor: 0.5, yAnchor: 0.5, zIndex: 3
            });
            this.renderedMarkers[id] = marker;
        }

        // 3. 경로 렌더링
        for (let id in data.paths) {
            const pathArr = data.paths[id].map(p => new kakao.maps.LatLng(p.lat, p.lng));
            const polyline = new kakao.maps.Polyline({
                map: this.map, path: pathArr,
                strokeWeight: MapStyles.path.strokeWidth, strokeColor: MapStyles.path.strokeColor, strokeOpacity: 1
            });
            this.renderedPaths[id] = polyline;
        }

        // 4. 히트맵 렌더링
        this.heatmapDataRef = data.heatmap;
        this.renderHeatmapPositions();
    }

    clearAll() {
        this.renderedShapes.forEach(s => s.setMap(null)); this.renderedShapes = [];
        for (let id in this.renderedMarkers) this.renderedMarkers[id].setMap(null); this.renderedMarkers = {};
        for (let id in this.renderedPaths) this.renderedPaths[id].setMap(null); this.renderedPaths = {};
    }

    renderHeatmapPositions() {
        if (!this.heatmapDataRef || this.heatmapDataRef.length === 0) {
            if (this.heatmapInstance) this.heatmapInstance.setData({ max: 0, data: [] });
            return;
        }

        const projection = this.map.getProjection();
        const bounds = this.map.getBounds();
        const points = [];

        this.heatmapDataRef.forEach(p => {
            const latlng = new kakao.maps.LatLng(p.lat, p.lng);
            if (bounds.contain(latlng)) {
                const point = projection.containerPointFromCoords(latlng);
                if (point) points.push({ x: Math.floor(point.x), y: Math.floor(point.y), value: p.weight || 50, radius: 15 });
            }
        });

        this.heatmapInstance.setData({ max: 150, data: points });
        this.heatmapContainer.style.opacity = '1';
    }
}
