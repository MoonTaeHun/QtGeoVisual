#include "ApiHandler.h"

ApiHandler::ApiHandler(QObject *parent) : QObject(parent) {
    networkManager = new QNetworkAccessManager(this);
    fetchTimer = new QTimer(this);
    connect(networkManager, &QNetworkAccessManager::finished, this, &ApiHandler::onReplyFinished);
    connect(fetchTimer, &QTimer::timeout, this, &ApiHandler::requestDroneData);
}

void ApiHandler::startFetching(int intervalMs) {
    fetchTimer->start(intervalMs);
}

void ApiHandler::startServerSimulation()
{
    // 서버의 시뮬레이션 시작 API 호출
    QUrl url("http://localhost:8080/api/sim/start");
    networkManager->get(QNetworkRequest(url));

    // 2. 서버가 생성을 시작했으므로, 1초 뒤부터 데이터를 가져오기 시작함
    QTimer::singleShot(50, this, [this](){
        this->startFetching(50); // 1초 간격으로 /latest 호출 시작
    });
}

void ApiHandler::resetServerSimulationData()
{
    QUrl url("http://localhost:8080/api/sim/reset");
    QNetworkRequest request(url);
    // DELETE 방식으로 요청
    networkManager->deleteResource(request);
}

void ApiHandler::requestDroneData() {
    // [수정 필요] 실제 Java 서버의 API 엔드포인트 주소를 입력하세요.
    QUrl url("http://localhost:8080/api/sim/latest");
    QNetworkRequest request(url);

    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    networkManager->get(request);
}

void ApiHandler::onReplyFinished(QNetworkReply *reply) {
    if (reply->error() == QNetworkReply::NoError) {
        QByteArray response = reply->readAll();
        QJsonDocument jsonDoc = QJsonDocument::fromJson(response);

        // [수정] 배열이 아니라 단일 객체(Object)를 파싱합니다.
        if (jsonDoc.isObject()) {
            QJsonObject obj = jsonDoc.object();

            QString id = obj["objectId"].toString();
            double lat = obj["latitude"].toDouble();
            double lng = obj["longitude"].toDouble();

            if (!id.isEmpty()) {
                emit droneDataReceived(id, lat, lng, "drone");
            }
        }
    } else {
        qDebug() << "API 접속 실패 (주소 확인 필요):" << reply->errorString();
    }
    reply->deleteLater();
}
