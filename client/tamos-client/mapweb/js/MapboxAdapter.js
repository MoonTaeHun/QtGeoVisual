class MapboxAdapter extends MapAdapter {
    constructor() {
        super();
        this.map = null;
        this.callbacks = null;
        this.isReady = false; // 준비 상태 플래그

        this.drawMode = null;
        this.drawCoords = [];
        this.previewFeature = null;
        this.domMarkers = {};
        this.renderedShapeMarkers = [];

        this.isPaused = false;
    }

    // [신규 추가] 맵박스가 퇴장할 때 이벤트 리스너 찌꺼기를 완벽하게 청소합니다!
    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.map) {
            // Mapbox API의 공식 클린업 함수: 모든 드래그 및 클릭 이벤트를 해제함
            this.map.remove(); 
            this.map = null;
        }
        // 부모 클래스(MapAdapter)의 기본 파괴 로직(innerHTML = "") 호출
        super.destroy(); 
    }

    init(containerId, viewState, callbacks) {
        this.callbacks = callbacks;
        mapboxgl.accessToken = 'pk.eyJ1IjoibWF5YmU4MzE0IiwiYSI6ImNtbGs4ZHhrYzAzcmIzZnNkNGFkaThqd3MifQ.DRDOAE4bq1G2TgMDmcxVSQ';

        this.map = new mapboxgl.Map({
            container: containerId,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [viewState.center.lng, viewState.center.lat],
            zoom: viewState.zoom,
            antialias: true
        });

        this.map.on('load', () => {
            console.log("Mapbox Load Complete");

            // 1. 마스터 소스 및 레이어 추가 (완료된 도형용)
            this.map.addSource('master-source', {
                'type': 'geojson',
                'data': { 'type': 'FeatureCollection', 'features': [] }
            });

            // 면 레이어
            this.map.addLayer({
                'id': 'master-fill',
                'type': 'fill',
                'source': 'master-source',
                'paint': {
                    // 데이터의 properties에서 색상을 가져옴. 없으면 기본값 적용.
                    'fill-color': ['coalesce', ['get', 'fillColor'], '#0000FF'],
                    'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.4]
                },
                'filter': ['==', '$type', 'Polygon']
            });

            // 선 레이어 (테두리 및 경로용)
            this.map.addLayer({
                'id': 'master-line',
                'type': 'line',
                'source': 'master-source',
                'paint': {
                    'line-color': ['coalesce', ['get', 'strokeColor'], '#0000FF'],
                    'line-width': ['coalesce', ['get', 'strokeWidth'], 3]
                },
                // Polygon의 테두리와 LineString 모두 표시
                'filter': ['any', ['==', '$type', 'Polygon'], ['==', '$type', 'LineString']]
            });

            // 2. 프리뷰 소스 및 레이어 추가 (그리는 중인 가이드용)
            this.map.addSource('preview-source', {
                'type': 'geojson',
                'data': { 'type': 'FeatureCollection', 'features': [] }
            });
            this.map.addLayer({
                'id': 'preview-fill', 'type': 'fill', 'source': 'preview-source',
                'paint': { 'fill-color': '#0000FF', 'fill-opacity': 0.3 },
                'filter': ['==', '$type', 'Polygon']
            });
            this.map.addLayer({
                'id': 'preview-line', 'type': 'line', 'source': 'preview-source',
                'paint': { 'line-color': '#0000FF', 'line-width': 2 }
            });

            // 히트맵 설정
            this.map.addSource('heatmap-source', {
                'type': 'geojson',
                'data': { 'type': 'FeatureCollection', 'features': [] }
            });

            const heatmapColorExpr = ['interpolate', ['linear'], ['heatmap-density']];
            MapStyles.heatmap.gradient.forEach(stop => {
                heatmapColorExpr.push(stop.density);
                heatmapColorExpr.push(stop.color);
            });

            this.map.addLayer({
                'id': 'heatmap-layer',
                'type': 'heatmap',
                'source': 'heatmap-source',
                'maxzoom': 18,
                'paint': {
                    // 1. [핵심 해결책] 카카오맵의 로직을 완벽하게 모사합니다.
                    // weight 값이 없으면 카카오처럼 50을 기본으로 주고, 0~150 범위를 0.0~1.0 비율로 쪼갭니다.
                    'heatmap-weight': [
                        'interpolate',
                        ['linear'],
                        ['coalesce', ['get', 'weight'], 50], // Kakao의 p.weight || 50 과 동일
                        0, 0,
                        150, 1   // Kakao의 max: 150 과 동일
                    ],

                    // 2. 강도(intensity)는 억지로 낮출 필요 없이 정상 범위로 되돌립니다.
                    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],

                    // 3. 반경 (StyleConfig 공통 사용)
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 15, MapStyles.heatmap.radius],

                    // 4. 색상 및 투명도
                    'heatmap-color': heatmapColorExpr,
                    'heatmap-opacity': MapStyles.heatmap.opacity * 0.6
                }
            }, 'waterway-label');

            this.setupDrawEvents();
            this.isReady = true; // [중요] 모든 레이어 세팅 완료 후 true

            // 초기 로드 시 대기 중이던 데이터 렌더링
            if (this.callbacks && this.callbacks.onReady) {
                this.callbacks.onReady();
            }

            if (this.callbacks && typeof this.callbacks.onLoad === 'function') {
                this.callbacks.onLoad();
            }
        });
    }

    // 데이터 렌더링 핵심 로직
    renderAll(data) {
        if (!this.map || !this.isReady) return;

        // 1. [핵심 성능 개선] 정적 데이터(도형, 경로)가 변경되었는지 문자열 비교(Hash)로 확인
        const currentStaticHash = JSON.stringify(data.shapes) + JSON.stringify(data.paths);

        // 데이터가 이전과 다를 때만 무거운 DOM 작업과 GeoJSON 파싱을 수행합니다.
        if (this._lastStaticHash !== currentStaticHash) {
            
            // 기존 마커 DOM 싹 지우기
            if (this.renderedShapeMarkers) {
                this.renderedShapeMarkers.forEach(m => m.remove());
            }
            this.renderedShapeMarkers = [];

            const features = [];

            // 도형 및 마커 변환
            data.shapes.forEach(shape => {
                try {
                    let f = null;
                    if (shape.type === 'circle') {
                        const radiusKm = shape.geometry.radius / 1000;
                        if (radiusKm > 0) f = turf.circle(shape.geometry.center, radiusKm, { units: 'kilometers' });
                    } else if (shape.type === 'rectangle') {
                        f = turf.bboxPolygon(shape.geometry.bbox);
                    } else if (shape.type === 'polygon') {
                        let coords = [...shape.geometry.coordinates];
                        if (coords.length >= 3) {
                            if (coords[0][0] !== coords[coords.length-1][0] || coords[0][1] !== coords[coords.length-1][1]) {
                                coords.push(coords[0]);
                            }
                            f = turf.polygon([coords]);
                        }
                    } else if (shape.type === 'marker') {
                        // 1. 컨테이너를 Flexbox로 설정 (복잡한 위치 계산 제거)
                        const el = document.createElement('div');
                        el.className = 'custom-marker-container';
                        el.style.display = 'flex';
                        el.style.flexDirection = 'column';  // 위에서 아래로 배치
                        el.style.alignItems = 'center';     // 가로 중앙 정렬

                        // 2. 아이콘 이미지
                        const img = document.createElement('img');
                        img.src = (shape.style && shape.style.icon) ? shape.style.icon : (MapStyles.marker.defaultIcon || '');
                        // 크기는 부모 div가 아닌 img 태그 자체에 직접 줍니다. (에러 방지용 안전 장치 포함)
                        const iconWidth = (typeof MapStyles !== 'undefined' && MapStyles.marker && MapStyles.marker.iconSize) ? MapStyles.marker.iconSize[0] : 24;
                        const iconHeight = (typeof MapStyles !== 'undefined' && MapStyles.marker && MapStyles.marker.iconSize) ? MapStyles.marker.iconSize[1] : 24;
                        img.style.width = iconWidth + 'px';
                        img.style.height = iconHeight + 'px';
                        el.appendChild(img);

                        // 3. 텍스트 라벨 (아이콘 바로 아래에 자연스럽게 붙음)
                        const name = (shape.properties && shape.properties.name) ? shape.properties.name : undefined;
                        if (name) {
                            const label = document.createElement('div');
                            label.innerText = name;
                            label.style.marginTop = '4px'; // 아이콘과 글자 사이 간격 띄우기
                            label.style.padding = '3px 6px';
                            label.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                            label.style.border = '1px solid #333';
                            label.style.borderRadius = '4px';
                            label.style.fontSize = '12px';
                            label.style.fontWeight = 'bold';
                            label.style.color = '#000';
                            label.style.whiteSpace = 'nowrap';
                            label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
                            
                            el.appendChild(label);
                        }

                        // [신규 추가] 4. 지도 영역 내 평점 미니 그래프 표출
                        try {
                            if (shape.properties && shape.properties['평점']) {
                                const rating = parseFloat(shape.properties['평점']);
                                const percentage = Math.min(100, Math.max(0, (rating / 5.0) * 100)); // 5.0 만점 기준 % 계산

                                // 그래프 겉 테두리(배경)
                                if (!isNaN(rating)) {
                                    const barBg = document.createElement('div');
                                    barBg.style.width = '60px'; // 그래프 전체 너비
                                    barBg.style.height = '8px'; // 그래프 두께
                                    barBg.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                                    barBg.style.border = '1px solid #555';
                                    barBg.style.borderRadius = '4px';
                                    barBg.style.marginTop = '4px'; // 텍스트와의 간격
                                    barBg.style.overflow = 'hidden';
                                    barBg.style.boxShadow = '0 1px 3px rgba(0,0,0,0.4)';

                                    // 그래프 채우기 (평점만큼 너비 조절)
                                    const barFill = document.createElement('div');
                                    barFill.style.width = percentage + '%';
                                    barFill.style.height = '100%';
                                    barFill.style.backgroundColor = '#ff9800'; // 주황색/노란색 계열

                                    barBg.appendChild(barFill);
                                    el.appendChild(barBg); // 마커 컨테이너에 그래프 추가
                                }
                            }
                        } catch (e) {
                            console.error("그래프 생성 중 에러 발생 (지도 멈춤 방지):", e);
                        }

                        // 4. 마커 등록
                        // anchor를 'bottom'으로 하면 마커의 맨 아랫부분(라벨의 바닥)이 좌표 위치에 정확히 꽂힙니다.
                        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                            .setLngLat([shape.geometry.coordinates[0], shape.geometry.coordinates[1]])
                            .addTo(this.map);
                            
                        this.renderedShapeMarkers.push(marker);
                        return; // 마커 처리는 여기서 끝. GeoJSON feature 배열에 넣지 않음.
                    }

                    if (f) {
                        f.properties = {
                            'fillColor': shape.style.fillColor,
                            'fillOpacity': shape.style.fillOpacity,
                            'strokeColor': shape.style.strokeColor,
                            'strokeWidth': shape.style.strokeWidth
                        };
                        features.push(f);
                    }
                } catch (e) { console.error("Shape rendering error:", e); }
            });

            // 경로 데이터 변환
            for (let id in data.paths) {
                try {
                    const pathData = data.paths[id];
                    if (pathData.length > 1) {
                        const line = turf.lineString(pathData.map(p => [p.lng, p.lat]));
                        line.properties = {
                            'strokeColor': MapStyles.path.strokeColor,
                            'strokeWidth': MapStyles.path.strokeWidth
                        };
                        features.push(line);
                    }
                } catch (e) {}
            }

            // 소스 업데이트
            const source = this.map.getSource('master-source');
            if (source) {
                source.setData({ 'type': 'FeatureCollection', 'features': features });
            }

            // 업데이트된 상태 저장 (다음번 호출 때 패스하기 위함)
            this._lastStaticHash = currentStaticHash; 
        }

        // 2. 히트맵 데이터 최적화 (히트맵도 데이터가 바뀔 때만 업데이트)
        const currentHeatmapHash = JSON.stringify(data.heatmap);
        if (this._lastHeatmapHash !== currentHeatmapHash) {
            const heatmapSource = this.map.getSource('heatmap-source');
            if (heatmapSource) {
                if (data.heatmap && Array.isArray(data.heatmap) && data.heatmap.length > 0) {
                    const heatmapFeatures = data.heatmap.map(point => turf.point([point.lng, point.lat], { weight: point.weight || 1 }));
                    heatmapSource.setData({ 'type': 'FeatureCollection', 'features': heatmapFeatures });
                } else {
                    heatmapSource.setData({ 'type': 'FeatureCollection', 'features': [] });
                }
            }
            this._lastHeatmapHash = currentHeatmapHash;
        }

        // 3. 동적 마커 렌더링 (실시간 드론 위치는 매번 업데이트)
        this.renderMarkers(data.markers);
    }

    renderMarkers(markers) {
        const markerFeatures = [];
    
        for (let id in markers) {
            const m = markers[id];
            // 텍스트 위치 설정 (기본값 bottom)
            const labelPos = m.labelPosition || 'bottom'; 
            const offset = MapStyles.marker.label.offsets[labelPos];

            markerFeatures.push({
                'type': 'Feature',
                'geometry': { 'type': 'Point', 'coordinates': [m.lng, m.lat] },
                'properties': {
                    'id': id,
                    'title': m.name || '', // 표시할 텍스트
                    'icon': m.icon || MapStyles.marker.defaultIcon,
                    // 맵박스 규격으로 오프셋 변환 (단위: em)
                    'offset': [offset[0] / 12, offset[1] / 12], 
                    'anchor': labelPos === 'top' ? 'bottom' : (labelPos === 'bottom' ? 'top' : labelPos)
                }
            });
        }

        // 전용 소스에 데이터 주입 (init에서 heatmap처럼 소스/레이어 미리 생성 필요)
        const source = this.map.getSource('marker-source');
        if (source) source.setData({ 'type': 'FeatureCollection', 'features': markerFeatures });
    }

    // 마우스 이벤트 및 그리기 로직 (기존 카카오 UX 모사 로직 유지)
    setupDrawEvents() {
        this.map.on('click', (e) => {
            if (!this.drawMode) return;

            const pos = [e.lngLat.lng, e.lngLat.lat];

            if (this.drawMode === 'marker') {
                this.drawCoords = [pos];
                this.finishDrawing();
                return;
            } else if (this.drawMode === 'circle' || this.drawMode === 'rectangle') {
                if (this.drawCoords.length === 0) this.drawCoords.push(pos);
                else { this.drawCoords.push(pos); this.finishDrawing(); }
            } else if (this.drawMode === 'polygon') {
                this.drawCoords.push(pos);
                this.updatePreview(e);
            }
        });
        this.map.on('mousemove', (e) => {
            if (!this.drawMode || this.drawCoords.length === 0) return;
            this.updatePreview(e);
        });
        this.map.on('contextmenu', () => {
            if (this.drawMode === 'polygon' && this.drawCoords.length >= 3) this.finishDrawing();
        });
    }

    updatePreview(e) {
        const curr = [e.lngLat.lng, e.lngLat.lat];
        try {
            if (this.drawMode === 'circle') {
                const radius = turf.distance(this.drawCoords[0], curr, { units: 'kilometers' });
                if (radius > 0.001) this.previewFeature = turf.circle(this.drawCoords[0], radius, { units: 'kilometers' });
            } else if (this.drawMode === 'rectangle') {
                const start = this.drawCoords[0];
                const bbox = [Math.min(start[0], curr[0]), Math.min(start[1], curr[1]), Math.max(start[0], curr[0]), Math.max(start[1], curr[1])];
                if (bbox[0] !== bbox[2]) this.previewFeature = turf.bboxPolygon(bbox);
            } else if (this.drawMode === 'polygon') {
                const coords = [...this.drawCoords, curr];
                if (coords.length > 2) this.previewFeature = turf.polygon([[...coords, coords[0]]]);
                else this.previewFeature = turf.lineString(coords);
            }
            if (this.previewFeature) {
                this.map.getSource('preview-source').setData({ 'type': 'FeatureCollection', 'features': [this.previewFeature] });
            }
        } catch(err) {}
    }

    finishDrawing() {
        if (!this.drawMode) return;
        
        let geom = null;
        
        if (this.drawMode === 'marker') {
            geom = { coordinates: this.drawCoords[0] };
        } else if (this.drawMode === 'circle') {
            const radiusKm = turf.distance(this.drawCoords[0], this.drawCoords[1], { units: 'kilometers' });
            geom = { center: this.drawCoords[0], radius: radiusKm * 1000 };
        } else if (this.drawMode === 'rectangle') {
            const s = this.drawCoords[0], e = this.drawCoords[1];
            geom = { bbox: [Math.min(s[0],e[0]), Math.min(s[1],e[1]), Math.max(s[0],e[0]), Math.max(s[1],e[1])] };
        } else if (this.drawMode === 'polygon') {
            geom = { coordinates: this.drawCoords };
        }

        const mode = this.drawMode;
        this.stopDrawing(); // 미리보기 초기화

        if (geom && this.callbacks.onShapeDrawn) {
            this.callbacks.onShapeDrawn(mode, geom); // 여기서 Model 업데이트 및 renderAll 호출됨
        }
    }

    startDrawing(type) {
        this.drawMode = type;
        this.drawCoords = [];
        this.previewFeature = null;
        if (this.map) this.map.getCanvas().style.cursor = 'crosshair';
    }

    stopDrawing() {
        this.drawMode = null;
        this.drawCoords = [];
        this.previewFeature = null;
        if (this.map) {
            this.map.getCanvas().style.cursor = '';
            if (this.map.getSource('preview-source')) {
                this.map.getSource('preview-source').setData({ 'type': 'FeatureCollection', 'features': [] });
            }
        }
    }

    getCurrentCenter() {
        if (!this.map) return { lat: 37.5546, lng: 126.9706 };
        const center = this.map.getCenter();
        return { lat: center.lat, lng: center.lng };
    }

    // 2. 현재 상태를 내보내는 함수 추가 (기존 getCurrentCenter를 대체/확장)
    getCurrentViewState() {
        if (!this.map) return { center: { lat: 37.5546, lng: 126.9706 }, zoom: 14 };
        
        const center = this.map.getCenter();
        return { 
            center: { lat: center.lat, lng: center.lng }, 
            zoom: this.map.getZoom() 
        };
    }

    set3DMode(enable) {
        if (!this.map) return;

        if (enable) {
            this.map.easeTo({ pitch: 60, bearing: -20, duration: 1000 });
            if (!this.map.getLayer('3d-buildings')) {
                this.map.addLayer({
                    'id': '3d-buildings',
                    'source': 'composite',
                    'source-layer': 'building',
                    'filter': ['==', 'extrude', 'true'],
                    'type': 'fill-extrusion',
                    'minzoom': 14,
                    'paint': {
                        'fill-extrusion-color': '#e0e0e0',
                        'fill-extrusion-height': ['get', 'height'],
                        'fill-extrusion-base': ['get', 'min_height'],
                        'fill-extrusion-opacity': 0.8
                    }
                });
            } else {
                this.map.setLayoutProperty('3d-buildings', 'visibility', 'visible');
            }
        } else {
            this.map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
            if (this.map.getLayer('3d-buildings')) {
                this.map.setLayoutProperty('3d-buildings', 'visibility', 'none');
            }
        }
    }

    // [신규] 통계 데이터 기반 3D 폴리곤 돌출 렌더링
    render3DGeoJson(geojsonData, heightKey) {
        if (!this.map) return;

        const sourceId = 'custom-3d-source';
        const layerId = 'custom-3d-layer';

        // 1. 데이터 소스 추가 또는 업데이트
        if (!this.map.getSource(sourceId)) {
            this.map.addSource(sourceId, {
                'type': 'geojson',
                'data': geojsonData
            });
        } else {
            this.map.getSource(sourceId).setData(geojsonData);
        }

        // 2. 3D 돌출 레이어 추가 또는 조건 업데이트
        if (!this.map.getLayer(layerId)) {
            this.map.addLayer({
                'id': layerId,
                'type': 'fill-extrusion',
                'source': sourceId,
                'paint': {
                    // 높이에 따라 색상을 다르게 표현 (낮음:파란색 -> 중간:노란색 -> 높음:빨간색)
                    'fill-extrusion-color': [
                        'interpolate',
                        ['linear'],
                        ['to-number', ['get', heightKey]], // 문자열이 섞여 있을까봐 강제로 숫자로 변환
                        0, '#3182bd',
                        50000, '#ffeda0',
                        150000, '#f03b20'
                    ],
                    // 수치값을 높이(m)로 변환 (예: 10만명 -> 2,000m 높이로 스케일링)
                    'fill-extrusion-height': ['*', ['to-number', ['get', heightKey]], 0.02],
                    'fill-extrusion-base': 0,
                    'fill-extrusion-opacity': 0.8
                }
            });
        } else {
            // 이미 레이어가 존재하면 사용자가 선택한 새로운 Key에 맞춰 높이와 색상 재계산
            this.map.setPaintProperty(layerId, 'fill-extrusion-height', ['*', ['to-number', ['get', heightKey]], 0.02]);
            this.map.setPaintProperty(layerId, 'fill-extrusion-color', [
                'interpolate',
                ['linear'],
                ['to-number', ['get', heightKey]],
                0, '#3182bd',
                50000, '#ffeda0',
                150000, '#f03b20'
            ]);
        }

        // 3D 효과를 잘 볼 수 있도록 카메라 기울이기 및 지형 중심으로 이동
        this.map.easeTo({ pitch: 60, bearing: -20, duration: 1500 });
    }

    showSimulationFlow(simData, layerType) {
        if (!this.map) return;

        // 1. 공통 초기화: 기존 애니메이션 강제 종료 및 모든 시뮬레이션 관련 레이어 삭제
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        // 등록된 모든 시뮬레이션 관련 레이어 ID 리스트
        const allLayerIds = ['sim-trips-layer', 'sim-arc-layer', 'sim-path-layer'];
        
        // 지도에서 해당 레이어들을 모두 제거
        allLayerIds.forEach(id => {
            if (this.map.getLayer(id)) {
                this.map.removeLayer(id);
            }
        });

        // 🔥 [추가] layerType이 'None'이거나 유효하지 않으면 여기서 종료 (화면 초기화)
        if (!layerType || layerType === 'None' || layerType === '') {
            console.log("모든 시뮬레이션 레이어가 제거되었습니다.");
            return; 
        }

        // ====================================================
        // 옵션 1: ArcLayer (출발지 ➔ 도착지 포물선)
        // 거시적인 OD(기종점) 연결성을 볼 때 유리합니다.
        // ====================================================
        if (layerType === 'ArcLayer') {
            const arcData = simData.map(d => ({
                source: d.path[0],                         // 출발지 좌표
                target: d.path[d.path.length - 1],         // 도착지 좌표
                color: d.color
            }));

            const arcLayer = new deck.MapboxLayer({
                id: 'sim-arc-layer',
                type: deck.ArcLayer,
                data: arcData,
                getSourcePosition: d => d.source,
                getTargetPosition: d => d.target,
                getSourceColor: d => d.color,
                getTargetColor: [255, 255, 255, 200], // 목적지는 하얀색으로 그라데이션
                getWidth: 3,
                getHeight: 0.5,
                getTilt: 15
            });

            this.map.addLayer(arcLayer);
            this.map.easeTo({ pitch: 45, bearing: -10, zoom: 11.5, center: [126.98, 37.53], duration: 1500 });
            console.log("ArcLayer 렌더링 완료");
        }

        // ====================================================
        // 옵션 2: PathLayer (실도로 주행 궤적 선)
        // 실제 어떤 도로망과 교차로를 이용했는지 분석할 때 유리합니다.
        // ====================================================
        else if (layerType === 'PathLayer') {
            const pathLayer = new deck.MapboxLayer({
                id: 'sim-path-layer',
                type: deck.PathLayer,
                data: simData,
                getPath: d => d.path,
                getColor: d => d.color,
                getWidth: 10,           // 선 두께(미터)
                widthMinPixels: 3,
                jointRounded: true,
                capRounded: true,
                opacity: 0.7,
                parameters: { depthTest: false }
            });

            this.map.addLayer(pathLayer);
            // 도로망이 잘 보이도록 지도를 평면에 가깝게(pitch: 20) 내려다봅니다.
            this.map.easeTo({ pitch: 20, bearing: 0, zoom: 11.5, center: [126.98, 37.53], duration: 1500 });
            console.log("PathLayer 렌더링 완료");
        }

        // ====================================================
        // 옵션 3: TripsLayer (실도로 주행 빛줄기 애니메이션)
        // 배차 알고리즘의 동적인 움직임과 시간차를 볼 때 유리합니다.
        // ====================================================
        else if (layerType === 'TripsLayer') {
            const VEHICLE_SPEED = 0.0003; 
            
            simData.forEach(trip => {
                if (trip.path && trip.path.length >= 2) {
                    let currentTime = trip.timestamps[0]; 
                    const newTimestamps = [currentTime];
                    for (let i = 1; i < trip.path.length; i++) {
                        const prev = trip.path[i - 1];
                        const curr = trip.path[i];
                        const dx = curr[0] - prev[0];
                        const dy = curr[1] - prev[1];
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        currentTime += (distance / VEHICLE_SPEED);
                        newTimestamps.push(currentTime);
                    }
                    trip.timestamps = newTimestamps; 
                }
            });

            // [추가] 데이터 유효성 검사 및 null 제거
            const sanitizedData = simData.filter(trip => {
                // path나 timestamps가 null인 객체는 아예 제외
                if (!trip.path || !trip.timestamps) return false;
                
                // timestamps 내부에 null이나 NaN이 있는지 검사
                const hasInvalidTime = trip.timestamps.some(t => t === null || isNaN(t));
                if (hasInvalidTime) {
                    console.warn("유효하지 않은 타임스탬프가 발견되어 제외됨:", trip);
                    return false;
                }
                return true;
            });

            let maxTime = 0;
            simData.forEach(d => {
                if (d.timestamps && d.timestamps.length > 0) {
                    const lastTime = d.timestamps[d.timestamps.length - 1];
                    if (lastTime > maxTime) maxTime = lastTime;
                }
            });
            maxTime += 150; 
            this.currentTripTime = 0; 

            const tripsLayer = new deck.MapboxLayer({
                id: 'sim-trips-layer',
                type: deck.TripsLayer,
                data: simData, 
                getPath: d => d.path,
                getTimestamps: d => d.timestamps,
                getColor: d => d.color,
                opacity: 0.9,
                widthMinPixels: 4,
                jointRounded: true,  // 경로가 꺾이는 지점(관절)을 둥글게 처리
                capRounded: true,    // 선의 시작과 끝부분(캡)을 둥글게 처리
                trailLength: 120,
                currentTime: this.currentTripTime,
                parameters: { depthTest: false },
                pickable: true, // 마우스 반응 활성화
                onHover: info => this.updateTooltip(info) // 호버 시 함수 호출
            });

            this.map.addLayer(tripsLayer);
            this.map.easeTo({ pitch: 55, bearing: -15, zoom: 11.5, center: [126.98, 37.53], duration: 1500 });

            const animate = () => {
                if (!this.isPaused) {
                    this.currentTripTime += 2; 
                }

                if (this.currentTripTime >= maxTime) {
                    this.currentTripTime = 0;
                    tripsLayer.setProps({ currentTime: this.currentTripTime });
                    this.map.triggerRepaint(); 
                    setTimeout(() => {
                        this.animationId = requestAnimationFrame(animate);
                    }, 100);
                } else {
                    tripsLayer.setProps({ currentTime: this.currentTripTime });
                    this.map.triggerRepaint(); 
                    this.animationId = requestAnimationFrame(animate);
                }
            };
            animate();
            console.log("TripsLayer 애니메이션 렌더링 완료");
        }
    }

    // [추가] 툴팁 생성 및 업데이트 함수
    updateTooltip(info) {
        const {x, y, object} = info;
        let tooltip = document.getElementById('map-tooltip');

        // 툴팁 엘리먼트가 없으면 생성
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'map-tooltip';
            tooltip.style.position = 'absolute';
            tooltip.style.zIndex = '1000';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            tooltip.style.color = 'white';
            tooltip.style.padding = '8px';
            tooltip.style.borderRadius = '4px';
            tooltip.style.fontSize = '12px';
            tooltip.style.fontFamily = 'sans-serif';
            tooltip.style.display = 'none';
            document.body.appendChild(tooltip);
        }

        if (object) {
            // 마우스가 차량 위에 있을 때 정보 표시
            const startPos = object.path[0];
            const endPos = object.path[object.path.length - 1];
            
            tooltip.style.display = 'block';
            tooltip.style.left = `${x + 15}px`;
            tooltip.style.top = `${y + 15}px`;
            tooltip.innerHTML = `
                <b>차량 정보</b><br/>
                노드 수: ${object.path.length}개<br/>
                출발지: ${startPos[0].toFixed(4)}, ${startPos[1].toFixed(4)}<br/>
                목적지: ${endPos[0].toFixed(4)}, ${endPos[1].toFixed(4)}
            `;
        } else {
            // 마우스가 벗어나면 숨김
            tooltip.style.display = 'none';
        }
    }

    setAnimationPause(paused) {
        this.isPaused = paused;
    }

    // [추가] 임의의 폴리곤 영역을 그리드로 채우는 함수
    createGridInPolygon(polygonCoords, cellSize, type = 'hex') {
        if (!this.map) return;

        // 1. 입력받은 좌표로 Turf 폴리곤 객체 생성
        // polygonCoords 형태: [[ [lng, lat], [lng, lat], ... ]]
        const maskPolygon = turf.polygon(polygonCoords);

        // 2. 폴리곤의 Bounding Box 계산 (그리드를 생성할 전체 범위)
        const bbox = turf.bbox(maskPolygon);

        // 3. BBox 범위에 일단 전체 그리드 생성
        const options = { units: 'kilometers' };
        let fullGrid;
        if (type === 'hex') {
            fullGrid = turf.hexGrid(bbox, cellSize, options);
        } else {
            fullGrid = turf.squareGrid(bbox, cellSize, options);
        }

        // 4. 🔥 핵심: 폴리곤 영역 내부에 있는 셀만 필터링 (Intersect 연산)
        const clippedFeatures = fullGrid.features.map(cell => {
            // 각 그리드 셀과 입력 폴리곤의 교집합 계산
            const intersection = turf.intersect(cell, maskPolygon);
            if (intersection) {
                // 원래 셀의 속성을 유지하면서 교차된 모양으로 업데이트
                intersection.properties = {
                    ...cell.properties,
                    demandValue: Math.random() * 100, // 초기 수요 값 (랜덤)
                    isFullCell: turf.area(intersection) / turf.area(cell) > 0.9 // 영역 보존율 체크
                };
                return intersection;
            }
            return null;
        }).filter(f => f !== null);

        const finalGrid = turf.featureCollection(clippedFeatures);

        // 5. Mapbox 레이어 업데이트
        this.updateMapSource('grid-source', finalGrid);
        this.addGridLayer('grid-layer', 'grid-source');

        console.log(`폴리곤 내 ${type} 그리드 생성 완료: ${clippedFeatures.length}개 셀`);
    }

    // 소스 업데이트 유틸리티
    updateMapSource(sourceId, data) {
        if (this.map.getSource(sourceId)) {
            // 이미 소스가 존재하면 데이터만 싹 갈아끼웁니다 (성능에 훨씬 좋음)
            this.map.getSource(sourceId).setData(data);
        } else {
            // 소스가 처음 만들어지는 경우라면 새로 등록합니다
            this.map.addSource(sourceId, { 
                type: 'geojson', 
                data: data,
                generateId: true // 클릭 하이라이트(feature-state)를 위해 꼭 필요함
            });
        }
    }

    // 레이어 스타일 설정
    addGridLayer(layerId, sourceId) {
        if (this.map.getLayer(layerId)) return;

        this.map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': [
                    'case',
                    ['boolean', ['feature-state', 'clicked'], false],
                    '#ffeb3b', // 🔥 클릭된 셀은 노란색으로 하이라이트
                    [
                        'interpolate',
                        ['linear'],
                        ['get', 'demandValue'],
                        0, '#eff3ff',
                        100, '#084594'
                    ]
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'clicked'], false],
                    0.9,
                    0.6
                ],
                'fill-outline-color': 'white'
            }
        });

        // 클릭 이벤트 등록
        this.map.on('click', layerId, (e) => {
            if (e.features.length > 0) {
                const feature = e.features[0];
                const props = feature.properties;
                
                // 1. 기존 선택 해제 및 새로운 셀 하이라이트 (Feature State 이용)
                if (this.lastSelectedCellId !== undefined) {
                    this.map.setFeatureState(
                        { source: sourceId, id: this.lastSelectedCellId },
                        { clicked: false }
                    );
                }
                this.lastSelectedCellId = feature.id;
                this.map.setFeatureState(
                    { source: sourceId, id: feature.id },
                    { clicked: true }
                );

                // 2. 팝업 표시
                new mapboxgl.Popup()
                    .setLngLat(e.lngLat)
                    .setHTML(`
                        <div style="color: #333; padding: 5px;">
                            <strong style="font-size: 14px;">📊 구역 수요 분석</strong><br/>
                            <hr style="margin: 5px 0;"/>
                            ID: <code>${props.cellId}</code><br/>
                            <b>예측 수요: ${parseFloat(props.demandValue).toFixed(2)}</b><br/>
                            상태: ${props.demandValue > 50 ? '⚠️ 혼잡 예상' : '✅ 원활'}
                        </div>
                    `)
                    .addTo(this.map);
                
                // 3. 필요 시 QML로 데이터 전달 (상세 그래프 표출용)
                console.log(`Cell Clicked: ${props.cellId}, Value: ${props.demandValue}`);
            }
        });

        // 마우스 커서 변경 (포인터)
        this.map.on('mouseenter', layerId, () => { this.map.getCanvas().style.cursor = 'pointer'; });
        this.map.on('mouseleave', layerId, () => { this.map.getCanvas().style.cursor = ''; });
    }

    // [추가] 특정 조건에 맞는 격자들을 머지하는 함수
    // [수정] 특정 조건에 맞는 격자들을 머지하는 함수
    mergeGridByCondition(sourceId) {
        const source = this.map.getSource(sourceId);
        if (!source || !source._data) return;

        const gridData = JSON.parse(JSON.stringify(source._data));
        const values = gridData.features.map(f => f.properties.demandValue).filter(v => v != null);
        if (values.length === 0) return;

        const max = Math.max(...values);
        const min = Math.min(...values);
        const range = max - min;

        // 1. 모든 격자에 레벨 부여 및 레벨별 그룹화
        const bins = {}; 
        gridData.features.forEach(f => {
            const val = f.properties.demandValue || 0;
            //const level = range > 0 ? Math.floor(((val - min) / range) * 8) : 0;
            const level = (val > 50) ? 1 : 0;
            f.properties.level = level;
            
            if (!bins[level]) bins[level] = [];
            bins[level].push(f);
        });

        // 2. 레벨별로 루프를 돌며 각각 머지 수행
        let mergedFeatures = [];
        Object.keys(bins).forEach(level => {
            const featuresInLevel = bins[level];
            if (featuresInLevel.length === 0) return;

            // 해당 레벨의 첫 번째 피처를 시작점으로 설정
            let unioned = featuresInLevel[0];
            
            // 나머지 피처들을 하나씩 합침 (turf.union)
            for (let i = 1; i < featuresInLevel.length; i++) {
                try {
                    unioned = turf.union(unioned, featuresInLevel[i]);
                } catch (e) {
                    console.error("머지 중 오류 발생:", e);
                }
            }

            if (unioned) {
                unioned.properties = { level: parseInt(level), displayScore: parseInt(level) };
                mergedFeatures.push(unioned);
            }
        });

        // 3. MultiPolygon이 섞여 있을 수 있으므로 개별 폴리곤으로 분리 (Flatten)
        const finalCollection = turf.flatten(turf.featureCollection(mergedFeatures));

        this.updateMapSource('merged-zone-source', finalCollection);
        this.addMergedLayer('merged-zone-layer', 'merged-zone-source');
        
        console.log(`구역 머지 완료: 생성된 독립 구역 ${finalCollection.features.length}개`);
    }

    // [수정] 머지된 레이어를 위한 전용 스타일
    addMergedLayer(layerId, sourceId) {
        const outlineId = layerId + '-outline';

        // 🔥 중요: 두 레이어 모두 안전하게 제거 후 다시 생성
        if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
        if (this.map.getLayer(outlineId)) this.map.removeLayer(outlineId);

        // 메인 채우기 레이어
        this.map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: {
                'fill-color': [
                    'interpolate', ['linear'], ['get', 'displayScore'],
                    0, '#ebfc07',  // 아주 낮은 레벨
                    1, '#f50606',  // 중간 레벨
                ],
                'fill-opacity': 0.7,
                'fill-outline-color': '#ffffff' // 1px 선은 유지 (구분감)
            }
        });

        // 외곽선 강조 레이어
        this.map.addLayer({
            id: outlineId,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': '#2c3e50',
                'line-width': 1.5,
                'line-opacity': 0.4
            }
        });
    }
}
