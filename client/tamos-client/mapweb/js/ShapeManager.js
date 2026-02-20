class ShapeManager {
    constructor() {
        this.shapes = [];    // { id, type, geometry, style }
        this.markers = {};   // { id: { lat, lng } }
        this.paths = {};     // { id: [{lat, lng}, ...] }
        this.heatmap = [];   // [{lat, lng, weight}]
    }

    addShape(type, geometry) {
        const shape = {
            id: 'shape-' + Date.now(),
            type: type,
            geometry: geometry, // circle: {center, radius}, bbox: [minX,minY,maxX,maxY], polygon: [[lng,lat]...]
            style: MapStyles[type] || MapStyles.polygon
        };
        this.shapes.push(shape);
        return shape;
    }

    updateMarker(id, lat, lng) {
        this.markers[id] = { lat, lng };
    }

    addPathPoint(id, lat, lng) {
        if (!this.paths[id]) this.paths[id] = [];
        this.paths[id].push({ lat, lng });
    }

    setHeatmap(data) {
        this.heatmap = data;
    }

    clearHeatmap() {
        this.heatmap = [];
    }

    // 어댑터(View)에게 전달할 전체 상태 스냅샷
    getAllData() {
        return {
            shapes: this.shapes,
            markers: this.markers,
            paths: this.paths,
            heatmap: this.heatmap
        };
    }

    getAllShapes() {
        return this.shapes;
    }
}
