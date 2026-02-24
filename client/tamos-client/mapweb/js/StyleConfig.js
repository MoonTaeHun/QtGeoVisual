const MapStyles = {
    polygon: {
        strokeColor: '#0000FF',
        strokeWidth: 3,
        fillColor: '#0000FF',
        fillOpacity: 0.4
    },
    rectangle: {
        strokeColor: '#00FF00',
        strokeWidth: 3,
        fillColor: '#00FF00',
        fillOpacity: 0.4
    },
    circle: {
        strokeColor: '#FF0000',
        strokeWidth: 2,
        fillColor: '#FF0000',
        fillOpacity: 0.3
    },
    path: {
        strokeColor: '#FF0000',
        strokeWidth: 4
    },
    heatmap: {
        radius: 20,      // 기본 반경
        opacity: 0.6,    // 투명도
        // 밀도(0.0 ~ 1.0)에 따른 색상 변화 (파란색 -> 녹색 -> 노란색 -> 빨간색)
        gradient: [
            { density: 0.0, color: 'rgba(0, 0, 255, 0)' },   // 밀도 0: 투명한 파란색
            { density: 0.2, color: 'rgb(0, 0, 255)' },       // 파란색
            { density: 0.4, color: 'rgb(0, 255, 255)' },     // 하늘색
            { density: 0.6, color: 'rgb(0, 255, 0)' },       // 녹색
            { density: 0.8, color: 'rgb(255, 255, 0)' },     // 노란색
            { density: 1.0, color: 'rgb(255, 0, 0)' }        // 빨간색
        ]
    },
    marker: {
        defaultIcon: 'assets/drone_icon.png', // 공통 아이콘 리소스 경로
        iconSize: [32, 32],                 // [width, height]
        label: {
            fontSize: '12px',
            color: '#000000',
            outlineColor: '#FFFFFF',
            outlineWidth: 2,
            // 아이콘 대비 상대적 위치 오프셋 (텍스트 위치 선택용)
            offsets: {
                'top': [0, -25],    // 아이콘 위
                'bottom': [0, 25],  // 아이콘 아래
                'left': [-25, 0],   // 아이콘 왼쪽
                'right': [25, 0]    // 아이콘 오른쪽
            }
        }
    }
};
