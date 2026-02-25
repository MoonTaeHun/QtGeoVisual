#ifndef APIHANDLER_H
#define APIHANDLER_H

#include <QObject>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QTimer>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>

class ApiHandler : public QObject
{
    Q_OBJECT
public:
    explicit ApiHandler(QObject *parent = nullptr);
    void startFetching(int intervalMs = 1000); // 주기적 요청 시작

signals:
    // 데이터를 받았을 때 MapBridge나 QML에 알릴 신호
    void allSimulationDataFetched(const QString& jsonData);
    void droneDataReceived(QString id, double lat, double lng, QString type);
    void heatmapDataFetched(const QString & jsonData);

private slots:
    void startServerSimulation();
    void resetServerSimulationData();
    void requestDroneData(); // 서버에 GET 요청
    void requestAllSimulationData();
    void onReplyFinished(QNetworkReply *reply); // 응답 처리
    void requestGenerateHeatmapData();
    void requestHeatmapData();
    void onHeatmapReplyFinished(QNetworkReply* reply);

private:
    QNetworkAccessManager * networkManager = nullptr;
    QTimer * fetchTimer = nullptr;
};

#endif
