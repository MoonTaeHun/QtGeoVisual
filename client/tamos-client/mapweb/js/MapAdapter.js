class MapAdapter {
    constructor() {
        this.map = null;
        this.markers = {};
        this.paths = {};
    }
    // 하위 클래스에서 반드시 구현해야 할 함수들
    getCurrentCenter() { throw new Error("getCurrentCenter() must be implemented"); }
    init(containerId, center, backupData) { throw new Error("init() must be implemented"); }
    updateMarker(id, lat, lng) { throw new Error("updateMarker() must be implemented"); }
    destroy() {
        const container = document.getElementById('map');
        if (container) container.innerHTML = "";
        this.markers = {};
        this.map = null;
    }

    addPathPoint(id, lat, lng) { throw new Error("Not Implemented"); }
    getPath(id) { return this.paths[id] || []; }
}
