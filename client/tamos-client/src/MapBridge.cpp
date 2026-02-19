#include "MapBridge.h"

MapBridge::MapBridge(QObject *parent)
    : QObject(parent), currentLat(37.5546), currentLng(126.9706) // 서울역 초기값
{
}

void MapBridge::simulateDroneMove()
{
    // 테스트: 호출할 때마다 위도/경도를 조금씩 변경 (북동쪽으로 이동)
    currentLat += 0.0001;
    currentLng += 0.0001;

    // QML로 신호 발사!
    emit updateMarker("Drone-01", currentLat, currentLng, "drone");

    qDebug() << "Drone Moved to:" << currentLat << currentLng;
}

void MapBridge::startSimulation()
{
    emit requestStartSimulation();
}

void MapBridge::resetSimulation()
{
    emit requestResetSimulation();
}

void MapBridge::generateHeatmap()
{
    emit requestGenerateHeatmapData();
}

void MapBridge::drawHeatmap()
{
    emit requestHeatmapData();
}
