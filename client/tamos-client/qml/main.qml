import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtWebEngine // WebEngine 모듈 임포트

ApplicationWindow {
    width: 1000
    height: 800
    visible: true
    title: "TAMOS Simulation System (Initial Build)"

    Connections {
        target: mapBridge

        function onUpdateMarker(id, lat, lng, type) {
            console.log("QML received signal:", id, lat, lng);

            // 지도 내부의 자바스크립트 함수 호출!
            // runJavaScript는 웹페이지 내부 함수를 실행하는 열쇠입니다.
            mapContainer.runJavaScript("mapManager.updateMarker('" + id + "', " + lat + ", " + lng + ", '" + type + "');");
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // 1. 지도 영역: MSVC 환경에서 WebEngine이 작동하는지 확인
        WebEngineView {
            id: mapContainer
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.preferredHeight: parent.height * 0.6

            //로컬 파일이 인터넷 스크립트를 로드하도록 허용
            settings.localContentCanAccessRemoteUrls: true
            settings.localContentCanAccessFileUrls: true
            settings.javascriptEnabled: true
            settings.errorPageEnabled: true

            layer.enabled: true
            layer.smooth: true
            backgroundColor: "transparent"

            // 로컬 HTML 파일 로드 (실행 경로 기준)
            url: "file:///" + applicationDirPath + "/mapweb/index.html"

            onLoadingChanged: function(loadRequest) {
                if (loadRequest.status === WebEngineView.LoadSucceededStatus) {
                    console.log("Map Loaded: " + loadRequest.url)
                } else if (loadRequest.status === WebEngineView.LoadFailedStatus) {
                    console.log("Map Load Failed: " + loadRequest.errorString)
                }
            }
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 50
            color: "#444"

            RowLayout {
                Button {
                    text: "Simulation Start"
                    onClicked: {
                        mapBridge.startSimulation()
                    }
                }

                Button {
                    text: "Reset Simulation Data"
                    onClicked: {
                        mapBridge.resetSimulation()
                    }
                }

                Button {
                    text: "MapBox"
                    onClicked: {
                        mapContainer.runJavaScript("mapManager.switchEngine('mapbox');")
                    }
                }

                Button {
                    text: "KakaoMap"
                    onClicked: {
                        mapContainer.runJavaScript("mapManager.switchEngine('kakao');")
                    }
                }
            }
        }

        // 2. 구분선 및 제어부
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 40
            color: "#333"
            Text {
                text: "Simulation Data Table (Status: Ready)"
                color: "white"
                anchors.centerIn: parent
            }
        }

        // 3. 데이터 테이블 영역 (고정 더미 데이터)
        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true

            ListView {
                clip: true
                model: ListModel {
                    ListElement { objectId: "Drone-01"; lat: "37.5546"; lon: "126.9706"; time: "16:18:16" }
                    ListElement { objectId: "Drone-02"; lat: "37.5663"; lon: "126.9779"; time: "16:18:17" }
                }
                delegate: Row {
                    spacing: 20
                    padding: 10
                    Text { text: model.objectId; width: 150 }
                    Text { text: model.lat; width: 100 }
                    Text { text: model.lon; width: 100 }
                    Text { text: model.time; width: 100 }
                }
            }
        }
    }
}
