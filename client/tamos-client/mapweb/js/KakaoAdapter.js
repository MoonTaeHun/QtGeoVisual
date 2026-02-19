class KakaoAdapter extends MapAdapter {
    constructor() {
        super();
        this.map = null;
        this.markers = {};
        this.paths = {};

        //히트맵 관련 변수
        this.heatmapInstance = null;
        this.heatmapData = [];
        this.heatmapContainer = null;
    }

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

            // 히트맵을 그릴 투명한 도화지(Div)를 지도 바로 위에 덮어씌웁니다.
            this.heatmapContainer = document.createElement('div');
            this.heatmapContainer.style.position = 'absolute';
            this.heatmapContainer.style.top = '0';
            this.heatmapContainer.style.left = '0';
            this.heatmapContainer.style.width = '100%';
            this.heatmapContainer.style.height = '100%';
            this.heatmapContainer.style.zIndex = '1';
            this.heatmapContainer.style.pointerEvents = 'none'; // 마우스 클릭이 지도로 통과되도록 설정
            this.heatmapContainer.style.transition = 'opacity 0.2s ease-in-out';

            // 지도 컨테이너 안에 히트맵 캔버스용 Div를 자식으로 추가
            container.appendChild(this.heatmapContainer);

            // 지도를 움직이거나 확대/축소할 때마다 히트맵 좌표를 다시 계산하도록 이벤트 연결
            kakao.maps.event.addListener(this.map, 'drag', () => this.updateHeatmapPositions());
            kakao.maps.event.addListener(this.map, 'zoom_changed', () => this.updateHeatmapPositions());
            kakao.maps.event.addListener(this.map, 'idle', () => this.updateHeatmapPositions());
            kakao.maps.event.addListener(this.map, 'zoom_start', () => {
                if (this.heatmapContainer) this.heatmapContainer.style.opacity = '0';
            });

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

    drawHeatmap(dataArray) {
        if (!this.map || !this.heatmapContainer) return;

        // 원본 위/경도 데이터 저장
        this.heatmapData = dataArray;
        this.heatmapContainer.style.opacity = '0.8';

        // 히트맵 객체가 없다면 최초 1회 생성
        if (!this.heatmapInstance) {
            this.heatmapInstance = h337.create({
                container: this.heatmapContainer,
                maxOpacity: 1.0,
                minOpacity: 0,
                blur: 0.85,
                gradient: {
                    0.0: 'rgba(33,102,172,0)',
                    0.2: 'rgb(103,169,207)',
                    0.5: 'rgb(253,219,199)',
                    0.8: 'rgb(239,138,98)',
                    1.0: 'rgb(178,24,43)'
                }
            });
        }

        // 화면 픽셀로 변환 후 그리기 실행
        this.updateHeatmapPositions();
    }

    // [핵심 3] 위/경도(LatLng) -> 화면 픽셀(X, Y) 변환 및 렌더링
    updateHeatmapPositions() {
        if (!this.heatmapInstance || this.heatmapData.length === 0) return;

        const projection = this.map.getProjection();
        if (!projection) return;

        const bounds = this.map.getBounds();
        const points = [];

        this.heatmapData.forEach(p => {
            const latlng = new kakao.maps.LatLng(p.lat, p.lng);

            if (bounds.contain(latlng)) {
                const point = projection.containerPointFromCoords(latlng);
                if (point) {
                    points.push({
                        x: Math.floor(point.x),
                        y: Math.floor(point.y),
                        value: p.weight, // (0~100 가중치)
                        radius: 15
                    });
                }
            }
        });

        // 데이터 갱신
        this.heatmapInstance.setData({
            // [동기화 4] Mapbox의 밀집도(Density)와 비슷해지도록 기준값을 설정합니다.
            // 150으로 두면, 가중치가 100인 점 하나만 있을 때는 주황색이고, 두 개가 겹치면 빨간색이 됩니다.
            // (만약 Mapbox보다 카카오가 덜 빨갛다면 이 숫자를 100으로 낮추고, 너무 빨갛다면 200으로 올려보세요.)
            max: 150,
            data: points
        });

        if (this.heatmapContainer) {
            this.heatmapContainer.style.opacity = '0.8';
        }
    }

    clearHeatmap() {
        this.heatmapData = [];
        if (this.heatmapInstance) {
            this.heatmapInstance.setData({ max: 0, data: [] });
        }
    }
}
