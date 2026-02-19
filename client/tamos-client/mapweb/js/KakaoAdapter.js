class KakaoAdapter extends MapAdapter {
    init(containerId, center, backupData) {
        if (typeof kakao === 'undefined') {
            console.error("Kakao Maps SDK not loaded.");
            return;
        }

        kakao.maps.load(() => {
            const container = document.getElementById(containerId);
            const options = {
                center: new kakao.maps.LatLng(center.lat, center.lng),
                level: 3
            };
            this.map = new kakao.maps.Map(container, options);
            console.log("Kakao Map Initialized");

            // [복원] 백업 데이터가 있다면 복구
            if (backupData) {
                // 1. 마커 복원
                if (backupData.markers) {
                    for (let id in backupData.markers) {
                        const m = backupData.markers[id];
                        this.updateMarker(id, m.lat, m.lng);
                    }
                }
                // 2. 궤적 복원
                if (backupData.paths) {
                    for (let id in backupData.paths) {
                        const pathList = backupData.paths[id];
                        // 여기서는 map이 확실히 있으므로 바로 그립니다.
                        pathList.forEach(p => this.addPathPoint(id, p.lat, p.lng));
                    }
                }
            }
        });
    }

    // [중요] 지도 전환 시 현재 중심 좌표를 유지하기 위해 필요
    getCurrentCenter() {
        if (!this.map) return { lat: 37.5546, lng: 126.9706 };
        const center = this.map.getCenter();
        return { lat: center.getLat(), lng: center.getLng() };
    }

    updateMarker(id, lat, lng) {
        if (!this.map) return; // 카카오는 DOM 오버레이라 맵 없으면 생성 불가

        const pos = new kakao.maps.LatLng(lat, lng);
        if (this.markers[id]) {
            this.markers[id].setPosition(pos);
        } else {
            const content = document.createElement('div');
            content.className = 'drone-marker';
            // CustomOverlay는 map 속성을 지정하면 바로 올라갑니다.
            this.markers[id] = new kakao.maps.CustomOverlay({
                position: pos,
                content: content,
                map: this.map,
                xAnchor: 0.5, // 가로 기준 50% 지점 (중앙)
                yAnchor: 0.5, // 세로 기준 50% 지점 (중앙)
                zIndex: 3     // 선보다 위에 보이도록 우선순위 높임
            });
        }
    }

    addPathPoint(id, lat, lng) {
        // [방어 코드 1] 데이터는 지도가 있든 없든 무조건 저장합니다. (순서 변경)
        if (!this.paths[id]) this.paths[id] = [];
        this.paths[id].push({lat: lat, lng: lng});

        // [방어 코드 2] 지도가 없으면 그리기만 포기하고 리턴 (데이터는 위에서 저장됨)
        if (!this.map) return;

        // 2. 지도 객체 관리 (Polyline)
        const pathArr = this.paths[id].map(p => new kakao.maps.LatLng(p.lat, p.lng));

        if (!this.polylines) this.polylines = {};

        if (this.polylines[id]) {
            this.polylines[id].setPath(pathArr);
        } else {
            this.polylines[id] = new kakao.maps.Polyline({
                map: this.map,
                path: pathArr,
                strokeWeight: 4,
                strokeColor: '#FF0000',
                strokeOpacity: 1,
                strokeStyle: 'solid'
            });
        }
    }
}
