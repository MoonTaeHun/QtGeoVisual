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

    // 시뮬레이션 기능 테스트
    Q_INVOKABLE void simulateDroneMove();
    Q_INVOKABLE void startSimulation();
    Q_INVOKABLE void resetSimulation();
    Q_INVOKABLE void requestSimFlowData();

    // 히트맵 기능 테스트
    Q_INVOKABLE void generateHeatmap();
    Q_INVOKABLE void drawHeatmap();

    // 일반 그리기 도구 기능 테스트
    Q_INVOKABLE void saveUserShapes(const QString& json);
    Q_INVOKABLE QString loadUserShapes();

    // 사용자 데이터 표출 기능 테스트
    Q_INVOKABLE QString readTextFile(const QString& fileUrl);
    Q_INVOKABLE void reportGeoJsonKeys(const QStringList& keys);

signals:
    // 시뮬레이션 기능
    void requestStartSimulation();
    void requestResetSimulation();
    void updateMarker(QString id, double lat, double lng, QString type);
    void requestAllSimulationData();
    void simFlowDataReady(const QString& jsonData);

    // 히트맵 기능
    void requestGenerateHeatmapData();
    void requestHeatmapData();
    void heatmapDataReady(const QString& jsonData);

    // 사용자 데이터 표출 기능 테스트
    void requestTextInput(double lat, double lng);   //지정된 좌표에 대해 텍스트 입력을 요청하는 시그널
    void geoJsonKeysReady(const QStringList& keys);

public slots:
    // JS -> C++: 사용자가 웹 지도에서 마커를 놓을 위치를 클릭했을 때 호출
    void onMarkerPositionSelected(double lat, double lng);

private:
    // 테스트용 좌표 변수
    double currentLat = 0.0;
    double currentLng = 0.0;
    UserAssetManager* m_assetManager = nullptr;
};

#endif // MAPBRIDGE_H
