class MapboxAdapter extends MapAdapter {
    init(containerId, center, backupData) {
        mapboxgl.accessToken = 'pk.eyJ1IjoibWF5YmU4MzE0IiwiYSI6ImNtbGs4ZHhrYzAzcmIzZnNkNGFkaThqd3MifQ.DRDOAE4bq1G2TgMDmcxVSQ';

        this.map = new mapboxgl.Map({
            container: containerId,
            style: 'mapbox://styles/mapbox/standard',
            center: [center.lng, center.lat],
            zoom: 14
        });

        // [복원 로직] 스타일 로딩이 끝난 후 실행 (안전지대)
        this.map.on('load', () => {
            console.log("Mapbox Style Loaded - Restoring Data...");
            if (backupData) {
                // 마커 복원
                if (backupData.markers) {
                    for (let id in backupData.markers) {
                        const m = backupData.markers[id];
                        this.updateMarker(id, m.lat, m.lng);
                    }
                }
                // 궤적 복원
                if (backupData.paths) {
                    for (let id in backupData.paths) {
                        const pathList = backupData.paths[id];
                        // 데이터만 채워넣고 그리기는 addPathPoint에 맡김
                        // (이미 로드 완료 상태이므로 바로 그려짐)
                        pathList.forEach(p => this.addPathPoint(id, p.lat, p.lng));
                    }
                }
            }
        });
    }

    getCurrentCenter() {
        if (!this.map) return { lat: 37.5546, lng: 126.9706 };
        const center = this.map.getCenter();
        return { lat: center.lat, lng: center.lng };
    }

    updateMarker(id, lat, lng) {
        if (!this.map) return;

        // [주의] DOM 마커는 스타일 로딩과 상관없이 동작하지만,
        // 안전을 위해 맵 인스턴스 존재 여부는 필수입니다.
        if (this.markers[id]) {
            this.markers[id].setLngLat([lng, lat]);
        } else {
            const el = document.createElement('div');
            el.className = 'drone-marker';
            this.markers[id] = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(this.map);
        }
    }

    addPathPoint(id, lat, lng) {
        if (!this.map) return;

        // 1. [데이터 저장] 이건 무조건 실행해야 데이터가 안 끊깁니다.
        if (!this.paths[id]) this.paths[id] = [];
        this.paths[id].push([lng, lat]);

        // 2. [방어 코드] 스타일 로딩 중이면 '그리기'만 중단하고 리턴!
        // "Style is not done loading" 에러를 막는 핵심입니다.
        if (!this.map.isStyleLoaded()) {
            return;
        }

        // 3. 지도에 그리기 (스타일 로드 완료 시에만 실행됨)
        const sourceId = 'route-' + id;

        if (!this.map.getSource(sourceId)) {
            this.map.addSource(sourceId, {
                'type': 'geojson',
                'data': {
                    'type': 'Feature',
                    'properties': {},
                    'geometry': {
                        'type': 'LineString',
                        'coordinates': this.paths[id]
                    }
                }
            });

            this.map.addLayer({
                'id': sourceId,
                'type': 'line',
                'source': sourceId,
                'layout': { 'line-join': 'round', 'line-cap': 'round' },
                'paint': {
                    'line-color': '#FF0000',
                    'line-width': 4
                }
            });
        } else {
            this.map.getSource(sourceId).setData({
                'type': 'Feature',
                'properties': {},
                'geometry': {
                    'type': 'LineString',
                    'coordinates': this.paths[id]
                }
            });
        }
    }

    drawHeatmap(dataArray) {
        if (!this.map || !this.map.isStyleLoaded()) return;

        // 1. 서버에서 온 [{lat: 37.x, lng: 126.x, weight: 50}] 포맷을 GeoJSON으로 변환
        const features = dataArray.map(point => ({
            'type': 'Feature',
            'properties': { 'weight': point.weight },
            'geometry': {
                'type': 'Point',
                'coordinates': [point.lng, point.lat] // Mapbox는 [경도, 위도]
            }
        }));

        const geojsonData = { 'type': 'FeatureCollection', 'features': features };
        const sourceId = 'heatmap-source';

        // 2. 지도에 소스 추가 (이미 있으면 데이터만 교체)
        if (this.map.getSource(sourceId)) {
            this.map.getSource(sourceId).setData(geojsonData);
        } else {
            this.map.addSource(sourceId, { 'type': 'geojson', 'data': geojsonData });

            // 3. 히트맵 레이어 추가
            this.map.addLayer({
                'id': 'heatmap-layer',
                'type': 'heatmap',
                'source': sourceId,
                'paint': {
                    // weight(0~100) 값에 따라 열기의 강도를 결정
                    'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 100, 1],
                    // 파랑 -> 노랑 -> 빨강 그라데이션
                    'heatmap-color': [
                        'interpolate', ['linear'], ['heatmap-density'],
                        0, 'rgba(33,102,172,0)',
                        0.2, 'rgb(103,169,207)',
                        0.5, 'rgb(253,219,199)',
                        0.8, 'rgb(239,138,98)',
                        1, 'rgb(178,24,43)'
                    ],
                    // 점 하나의 퍼짐 정도 (픽셀)
                    'heatmap-radius': 15,
                    'heatmap-opacity': 0.8
                }
            });
        }
    }

    clearHeatmap() {
        if (!this.map) return;
        if (this.map.getLayer('heatmap-layer')) this.map.removeLayer('heatmap-layer');
        if (this.map.getSource('heatmap-source')) this.map.removeSource('heatmap-source');
    }
}
