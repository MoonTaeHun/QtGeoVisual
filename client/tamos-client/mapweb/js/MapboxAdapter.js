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
}
