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
    }

    init(containerId, viewState, callbacks) {
        this.callbacks = callbacks;
        mapboxgl.accessToken = 'pk.eyJ1IjoibWF5YmU4MzE0IiwiYSI6ImNtbGs4ZHhrYzAzcmIzZnNkNGFkaThqd3MifQ.DRDOAE4bq1G2TgMDmcxVSQ';

        this.map = new mapboxgl.Map({
            container: containerId,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [viewState.center.lng, viewState.center.lat],
            zoom: viewState.zoom
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
}
