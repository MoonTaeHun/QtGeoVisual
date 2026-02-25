#include "ApiHandler.h"

ApiHandler::ApiHandler(QObject *parent)
    : QObject(parent)
{
    networkManager = new QNetworkAccessManager(this);
    fetchTimer = new QTimer(this);
    connect(fetchTimer, &QTimer::timeout, this, &ApiHandler::requestDroneData);
}

void ApiHandler::startFetching(int intervalMs)
{
    fetchTimer->start(intervalMs);
}

void ApiHandler::startServerSimulation()
{
    // 서버의 시뮬레이션 시작 API 호출
    QUrl url("http://DESKTOP-A3T49SK:8080/api/sim/start");
    networkManager->get(QNetworkRequest(url));

    // 2. 서버가 생성을 시작했으므로, 1초 뒤부터 데이터를 가져오기 시작함
    QTimer::singleShot(50, this, [this](){
        this->startFetching(50); // 1초 간격으로 /latest 호출 시작
    });
}

void ApiHandler::resetServerSimulationData()
{
    QUrl url("http://DESKTOP-A3T49SK:8080/api/sim/reset");
    QNetworkRequest request(url);
    // DELETE 방식으로 요청
    networkManager->deleteResource(request);
}

void ApiHandler::requestDroneData() {
    // 실제 Java 서버의 API 엔드포인트 주소를 입력하세요.
    QUrl url("http://DESKTOP-A3T49SK:8080/api/sim/latest");
    QNetworkRequest request(url);

    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    QNetworkReply* reply = networkManager->get(request);

    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        onReplyFinished(reply);
    });
}

void ApiHandler::requestAllSimulationData()
{
    //QUrl url("http://DESKTOP-A3T49SK:8080/api/sim/od-data");
    QUrl url("http://DESKTOP-A3T49SK:8080/api/sim/real-od");
    QNetworkReply* reply = networkManager->get(QNetworkRequest(url));

    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        if (reply->error() == QNetworkReply::NoError)
        {
            QString jsonData = QString::fromUtf8(reply->readAll());
            qDebug() << "전체 시뮬레이션 데이터 수신 성공!";
            emit allSimulationDataFetched(jsonData);
        }
        else
        {
            qDebug() << "전체 시뮬레이션 데이터 수신 실패:" << reply->errorString();
        }
        reply->deleteLater();
    });
}

void ApiHandler::onReplyFinished(QNetworkReply *reply)
{
    if(reply->error() == QNetworkReply::NoError)
    {
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
    }
    else
    {
        qDebug() << "API 접속 실패 (주소 확인 필요):" << reply->errorString();
    }

    reply->deleteLater();
}

void ApiHandler::requestGenerateHeatmapData()
{
    QUrl url("http://DESKTOP-A3T49SK:8080/api/heatmap/generate");
    QNetworkRequest request(url);

    // POST 요청임을 명시하고, JSON 형식으로 보낸다고 헤더에 설정합니다.
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");

    // 보낼 데이터 (이번엔 단순히 명령만 내리는 것이라 빈 JSON "{}"을 보냅니다)
    QByteArray postData = "{}";

    // get() 대신 post()를 사용!
    QNetworkReply* reply = networkManager->post(request, postData);

    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        if(reply->error() == QNetworkReply::NoError)
        {
            qDebug() << "POST 요청 성공";
        }
        else
        {
            qDebug() << "POST 요청 실패:" << reply->errorString();
        }

        reply->deleteLater();
    });
}

void ApiHandler::requestHeatmapData()
{
    QUrl url("http://DESKTOP-A3T49SK:8080/api/heatmap/data");
    QNetworkReply* reply = networkManager->get(QNetworkRequest(url));

    // 이 요청에 대해서만 특별히 onHeatmapReplyFinished로 연결
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        onHeatmapReplyFinished(reply);
    });
}

void ApiHandler::onHeatmapReplyFinished(QNetworkReply* reply)
{
    if(reply->error() == QNetworkReply::NoError)
    {
        QString jsonData = QString::fromUtf8(reply->readAll());
        emit heatmapDataFetched(jsonData); // MapBridge로 데이터 전달
    }
    else
    {
        qDebug() << "히트맵 API 에러:" << reply->errorString();
    }

    reply->deleteLater();
}
