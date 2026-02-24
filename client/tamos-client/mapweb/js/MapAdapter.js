class MapAdapter {
    constructor() {
        this.isReady = false; //로드 완료 여부 플래그
    }
    getCurrentCenter() { throw new Error("Not implemented"); }
    getCurrentViewState() { throw new Error("Not implemented"); }
    init(containerId, viewState, callbacks) { throw new Error("Not implemented"); }
    destroy() {
        const container = document.getElementById('map');
        if (container) container.innerHTML = "";
    }

    // View 핵심 기능: Model 데이터를 받아 화면에 그리기만 함
    renderAll(data) { throw new Error("Not implemented"); }

    // 사용자 조작 관련
    startDrawing(type) { throw new Error("Not implemented"); }
    stopDrawing() { throw new Error("Not implemented"); }

    // 상태 확인 함수
    isLoaded() { return this.isReady; }

    set3DMode(enable) { throw new Error("Not implemented"); }
    render3DGeoJson(geojsonData, heightKey)  { throw new Error("Not implemented"); }
}
