#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QtWebEngineQuick/qtwebenginequickglobal.h> // WebEngine 초기화용
#include <QQmlContext>
#include <QSslSocket>
#include <QQuickWindow>
#include <QWebEngineProfile>
#include <QWebEngineSettings>
#include "src/ApiHandler.h"
#include "src/MapBridge.h"

int main(int argc, char *argv[])
{
    // OpenSSL 동작 여부 체크
    bool temp_support_ssl = QSslSocket::supportsSsl();
    QString temp_ssl_build_version = QSslSocket::sslLibraryBuildVersionString();
    QString temp_ssl_version = QSslSocket::sslLibraryVersionString();

    qDebug() << temp_support_ssl << temp_ssl_build_version << temp_ssl_version;

    if(false == temp_support_ssl)
    {
        QCoreApplication::exit(-1);
        return 0;
    }

    // Qt WebEngine을 사용하기 위한 환경 설정
    qputenv("QTWEBENGINE_CHROMIUM_FLAGS",
            "--ignore-gpu-blocklist "
            "--enable-gpu-rasterization "
            "--enable-zero-copy "
            "--disable-web-security");

#if QT_VERSION < QT_VERSION_CHECK(6, 0, 0)
    QCoreApplication::setAttribute(Qt::AA_EnableHighDpiScaling);
    QCoreApplication::setAttribute(Qt::AA_UseHighDpiPixmaps);
#endif

    // Qt Quick 렌더링 엔진을 OpenGL로 고정
    // Mapbox(WebGL)는 OpenGL 환경에서 가장 성능이 좋습니다.
    // 윈도우 기본값(D3D11)과 충돌을 막기 위해 OpenGL로 맞춥니다.
    QQuickWindow::setGraphicsApi(QSGRendererInterface::OpenGLRhi);
    QtWebEngineQuick::initialize();
    QGuiApplication app(argc, argv);

    // defaultProfile()은 포인터를 반환하므로 접근 방식이 맞는지 확인하세요.
    QWebEngineProfile *profile = QWebEngineProfile::defaultProfile();
    if (profile) {
        profile->settings()->setAttribute(QWebEngineSettings::LocalContentCanAccessRemoteUrls, true);
        profile->settings()->setAttribute(QWebEngineSettings::LocalContentCanAccessFileUrls, true);
        profile->settings()->setAttribute(QWebEngineSettings::AllowRunningInsecureContent, true);
    }

    QQmlApplicationEngine engine;

    MapBridge mapBridge;
    ApiHandler apiHandler;

    // API에서 데이터를 받으면 MapBridge의 신호를 발생시켜 지도를 업데이트함
    QObject::connect(&mapBridge, SIGNAL(requestStartSimulation()),
                     &apiHandler, SLOT(startServerSimulation()));
    QObject::connect(&mapBridge, SIGNAL(requestResetSimulation()),
                     &apiHandler, SLOT(resetServerSimulationData()));
    QObject::connect(&mapBridge, SIGNAL(requestGenerateHeatmapData()),
                     &apiHandler, SLOT(requestGenerateHeatmapData()));
    QObject::connect(&mapBridge, SIGNAL(requestHeatmapData()),
                     &apiHandler, SLOT(requestHeatmapData()));
    QObject::connect(&apiHandler, &ApiHandler::droneDataReceived,
                     &mapBridge, &MapBridge::updateMarker);
    QObject::connect(&apiHandler, &ApiHandler::heatmapDataFetched,
                     &mapBridge, &MapBridge::heatmapDataReady);

    //QML 컨텍스트에 등록
    engine.rootContext()->setContextProperty("applicationDirPath", QCoreApplication::applicationDirPath());
    engine.rootContext()->setContextProperty("mapBridge", &mapBridge);

    // 서버 통신 시작 (1초마다 요청)
    //apiHandler.startFetching(1000);

    // CMake qt_add_qml_module에서 설정한 URI 기반 경로
    const QUrl url(u"qrc:/qt/qml/Tamos/qml/main.qml"_qs);

    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated,
                     &app, [url](QObject *obj, const QUrl &objUrl) {
                         if (!obj && url == objUrl)
                             QCoreApplication::exit(-1);
                     }, Qt::QueuedConnection);

    engine.load(url);

    return app.exec();
}
