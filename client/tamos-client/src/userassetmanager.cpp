#include "UserAssetManager.h"
#include <QStandardPaths>
#include <QDir>
#include <QSqlError>

UserAssetManager::UserAssetManager(QObject *parent) : QObject(parent) {}

bool UserAssetManager::initDatabase() {
    m_db = QSqlDatabase::addDatabase("QSQLITE");

    // Windows의 AppData/Local/mytamos_client 폴더 경로를 자동으로 찾음
    QString appDataPath = QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
    QDir dir(appDataPath);
    if (!dir.exists()) dir.mkpath("."); // 폴더가 없으면 생성

    QString dbPath = dir.filePath("user_assets.db");
    m_db.setDatabaseName(dbPath);

    qDebug() << "데이터베이스 실제 경로:" << dbPath;

    if (!m_db.open()) return false;

    QSqlQuery query;
    // 서버 DB와 동일한 구조로 테이블 설계
    // id: 고유값, type: 도형타입, data: 지오메트리 JSON, style: 스타일 JSON
    return query.exec("CREATE TABLE IF NOT EXISTS user_shapes ("
                      "id TEXT PRIMARY KEY, "
                      "type TEXT, "
                      "geometry_json TEXT, "
                      "style_json TEXT, "
                      "timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");
}

void UserAssetManager::saveShapes(const QString& jsonString) {
    QJsonDocument doc = QJsonDocument::fromJson(jsonString.toUtf8());
    if (!doc.isArray()) return;

    QSqlDatabase::database().transaction();
    QSqlQuery query;

    // 기존 데이터를 지우고 새로 저장 (동기화)
    query.exec("DELETE FROM user_shapes");

    QJsonArray arr = doc.array();
    for (const QJsonValue& val : arr) {
        QJsonObject obj = val.toObject();
        query.prepare("INSERT INTO user_shapes (id, type, geometry_json, style_json) "
                      "VALUES (:id, :type, :geom, :style)");
        query.bindValue(":id", obj["id"].toString());
        query.bindValue(":type", obj["type"].toString());
        query.bindValue(":geom", QJsonDocument(obj["geometry"].toObject()).toJson(QJsonDocument::Compact));
        query.bindValue(":style", QJsonDocument(obj["style"].toObject()).toJson(QJsonDocument::Compact));
        query.exec();
    }
    QSqlDatabase::database().commit();
}

QString UserAssetManager::loadShapes() {
    QJsonArray rootArray;
    QSqlQuery query("SELECT id, type, geometry_json, style_json FROM user_shapes");

    while (query.next()) {
        QJsonObject obj;
        obj["id"] = query.value(0).toString();
        obj["type"] = query.value(1).toString();

        // 저장할 때 String으로 바꿨던 JSON들을 다시 Object로 복원
        obj["geometry"] = QJsonDocument::fromJson(query.value(2).toByteArray()).object();
        obj["style"] = QJsonDocument::fromJson(query.value(3).toByteArray()).object();

        rootArray.append(obj);
    }

    return QJsonDocument(rootArray).toJson(QJsonDocument::Compact);
}
