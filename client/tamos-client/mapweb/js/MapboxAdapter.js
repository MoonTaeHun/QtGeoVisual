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
    }

    init(containerId, center, callbacks) {
        this.callbacks = callbacks;
        mapboxgl.accessToken = 'pk.eyJ1IjoibWF5YmU4MzE0IiwiYSI6ImNtbGs4ZHhrYzAzcmIzZnNkNGFkaThqd3MifQ.DRDOAE4bq1G2TgMDmcxVSQ';

        this.map = new mapboxgl.Map({
            container: containerId,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [center.lng, center.lat],
            zoom: 14
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

            // 히트맵 설정 생략 (필요시 추가)
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

        const features = [];

        // 1. 도형 변환 및 스타일 주입
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
                }

                if (f) {
                    // [해결책] StyleConfig의 값을 레이어가 사용하는 속성명으로 정확히 매핑
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

        // 2. 경로 데이터 변환
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

        // [수정된 히트맵 데이터 변환 및 소스 업데이트]
        // 1. 소스 객체를 딱 한 번만 가져와서 변수에 담습니다.
        const heatmapSource = this.map.getSource('heatmap-source');

        // 2. 소스가 정상적으로 존재할 때만 분기 처리
        if (heatmapSource) {
            if (data.heatmap && Array.isArray(data.heatmap) && data.heatmap.length > 0) {
                // 데이터가 있을 때: GeoJSON으로 변환해서 넣기
                const heatmapFeatures = data.heatmap.map(point => {
                    return turf.point([point.lng, point.lat], { weight: point.weight || 1 });
                });

                heatmapSource.setData({
                    'type': 'FeatureCollection',
                    'features': heatmapFeatures
                });
            } else {
                // 데이터가 없을 때 (Clear 처리): 빈 배열 넣기
                heatmapSource.setData({
                    'type': 'FeatureCollection',
                    'features': []
                });
            }
        }

        // 마커 업데이트
        this.renderMarkers(data.markers);
    }

    renderMarkers(markers) {
        for (let id in markers) {
            const m = markers[id];
            if (this.domMarkers[id]) {
                this.domMarkers[id].setLngLat([m.lng, m.lat]);
            } else {
                const el = document.createElement('div');
                el.className = 'drone-marker';
                this.domMarkers[id] = new mapboxgl.Marker(el).setLngLat([m.lng, m.lat]).addTo(this.map);
            }
        }
    }

    // 마우스 이벤트 및 그리기 로직 (기존 카카오 UX 모사 로직 유지)
    setupDrawEvents() {
        this.map.on('click', (e) => {
            if (!this.drawMode) return;
            const pos = [e.lngLat.lng, e.lngLat.lat];
            if (this.drawMode === 'circle' || this.drawMode === 'rectangle') {
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
        if (this.drawMode === 'circle') {
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
}
