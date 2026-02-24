#include "MapBridge.h"

MapBridge::MapBridge(QObject *parent)
    : QObject(parent), currentLat(37.5546), currentLng(126.9706) // 서울역 초기값
{
    this->setObjectName("mapBridge");
    qDebug() << "MapBridge 생성 시작...";

    // 1. 객체 생성 (this를 부모로 지정하여 메모리 관리 자동화)
    m_assetManager = new UserAssetManager(this);

    // 2. 초기화 전에 포인터 검사
    if (m_assetManager) {
        m_assetManager->initDatabase();
        qDebug() << "UserAssetManager 초기화 완료";
    } else {
        qCritical() << "UserAssetManager 생성 실패!";
    }
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

void MapBridge::saveUserShapes(const QString& json)
{
    m_assetManager->saveShapes(json);
    qDebug() << "User shapes saved to local DB";
}

QString MapBridge::loadUserShapes()
{
    return m_assetManager->loadShapes();
}

void MapBridge::onMarkerPositionSelected(double lat, double lng)
{
    emit requestTextInput(lat, lng);
}
