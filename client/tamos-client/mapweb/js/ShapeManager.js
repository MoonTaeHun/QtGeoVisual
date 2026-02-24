class ShapeManager {
    constructor() {
        this.shapes = [];    // { id, type, geometry, style }
        this.markers = {};   // { id: { lat, lng } }
        this.paths = {};     // { id: [{lat, lng}, ...] }
        this.heatmap = [];   // [{lat, lng, weight}]
        this.nextId = 1;
    }

    addShape(type, geometry, properties = {}, style = null) {
        const shape = {
            id: 'shape-' + Date.now() + '-' + (this.nextId++),
            type: type,
            geometry: geometry, // circle: {center, radius}, bbox: [minX,minY,maxX,maxY], polygon: [[lng,lat]...]
            properties: properties, // [핵심] 여기서 데이터를 저장해야 합니다!
            style: style || this.getDefaultStyle(type)
        };
        this.shapes.push(shape);
        return shape;
    }

    getDefaultStyle(type) {
        const styles = typeof MapStyles !== 'undefined' ? MapStyles : {};

        switch (type) {
            case 'marker':
                return {
                    icon: (styles.marker && styles.marker.defaultIcon) ? styles.marker.defaultIcon : '',
                    labelPosition: 'bottom'
                };
            case 'polygon':
            case 'circle':
            case 'rectangle':
                return {
                    fillColor: (styles.polygon && styles.polygon.fillColor) ? styles.polygon.fillColor : '#0000FF',
                    fillOpacity: (styles.polygon && styles.polygon.fillOpacity) ? styles.polygon.fillOpacity : 0.4,
                    strokeColor: (styles.polygon && styles.polygon.strokeColor) ? styles.polygon.strokeColor : '#0000FF',
                    strokeWidth: (styles.polygon && styles.polygon.strokeWidth) ? styles.polygon.strokeWidth : 3
                };
            case 'path':
            case 'line':
            case 'polyline':
                return {
                    strokeColor: (styles.path && styles.path.strokeColor) ? styles.path.strokeColor : '#FF0000',
                    strokeWidth: (styles.path && styles.path.strokeWidth) ? styles.path.strokeWidth : 3
                };
            default:
                return {};
        }
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
