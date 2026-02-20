#ifndef MAPBRIDGE_H
#define MAPBRIDGE_H

#include <QObject>
#include <QDebug>
#include "userassetmanager.h"

class MapBridge : public QObject
{
    Q_OBJECT
public:
    explicit MapBridge(QObject *parent = nullptr);

    // 버튼 누르면 드론 위치를 조금씩 이동시키는 함수
    Q_INVOKABLE void simulateDroneMove();
    Q_INVOKABLE void startSimulation();
    Q_INVOKABLE void resetSimulation();
    Q_INVOKABLE void generateHeatmap();
    Q_INVOKABLE void drawHeatmap();
    Q_INVOKABLE void saveUserShapes(const QString& json);
    Q_INVOKABLE QString loadUserShapes();

signals:
    // QML로 보낼 신호: "이 ID를 가진 드론을 (lat, lng)으로 이동시켜라"
    void requestStartSimulation();
    void requestResetSimulation();
    void updateMarker(QString id, double lat, double lng, QString type);
    void requestGenerateHeatmapData();
    void requestHeatmapData();
    void heatmapDataReady(const QString& jsonData);

private:
    // 테스트용 좌표 변수
    double currentLat;
    double currentLng;
    UserAssetManager* m_assetManager = nullptr;
};

#endif // MAPBRIDGE_H
