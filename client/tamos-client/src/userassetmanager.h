#ifndef USERASSETMANAGER_H
#define USERASSETMANAGER_H

#include <QObject>
#include <QSqlDatabase>
#include <QSqlQuery>
#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonObject>

class UserAssetManager : public QObject {
    Q_OBJECT
public:
    explicit UserAssetManager(QObject *parent = nullptr);
    bool initDatabase();

    // 데이터를 저장 (나중에 서버 POST API로 대체될 부분)
    void saveShapes(const QString& jsonString);

    // 데이터를 불러옴 (나중에 서버 GET API로 대체될 부분)
    QString loadShapes();

private:
    QSqlDatabase m_db;
};

#endif
