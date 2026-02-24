import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
import QtWebEngine
import QtWebChannel

ApplicationWindow {
    width: 1000
    height: 800
    visible: true
    title: "TAMOS Simulation System (Initial Build)"

    property real currentMarkerLat: 0.0
    property real currentMarkerLng: 0.0

    Connections {
        target: mapBridge

        function onUpdateMarker(id, lat, lng, type) {
            mapContainer.runJavaScript("mapManager.updateMarker('" + id + "', " + lat + ", " + lng + ", '" + type + "');");
        }

        function onHeatmapDataReady(jsonData) {
            mapContainer.runJavaScript("mapManager.drawHeatmap(`" + jsonData + "`);")
        }

        function onRequestTextInput(lat, lng) {
            currentMarkerLat = lat
            currentMarkerLng = lng

            inputField.clear()
            textInputPopup.open()
            inputField.forceActiveFocus()
        }

        function onGeoJsonKeysReady(keys) {
            mappingComboBox.model = keys
            if (keys.length > 0) mappingComboBox.currentIndex = 0
            mappingPopup.open()
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        WebChannel {
            id: qmlWebChannel

            // C++에서 ContextProperty로 등록한 mapBridge를 채널에 등록합니다.
            Component.onCompleted: {
                qmlWebChannel.registerObject("mapBridge", mapBridge)
            }
        }

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

            // 로컬 웹지도 서버 연결
            url: "http://127.0.0.1:5500/index.html"
            webChannel: qmlWebChannel

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

                Button {
                    text: "히트맵 데이터 생성"
                    onClicked: {
                        mapBridge.generateHeatmap()
                    }
                }

                Button {
                    property bool onHeatmap: false

                    text: "히트맵 표출"
                    onClicked: {
                        if(onHeatmap) {
                            mapContainer.runJavaScript("mapManager.clearHeatmap();")
                            onHeatmap = false
                        } else {
                            mapBridge.drawHeatmap()
                            onHeatmap = true
                        }
                    }
                }

                Button {
                    text: "원 그리기"
                    onClicked: mapContainer.runJavaScript("mapManager.startDrawing('circle');")
                }

                Button {
                    text: "사각형 그리기"
                    onClicked: mapContainer.runJavaScript("mapManager.startDrawing('rectangle');")
                }

                Button {
                    text: "다각형 그리기"
                    onClicked: mapContainer.runJavaScript("mapManager.startDrawing('polygon');")
                }

                Button {
                    text: "아이콘 찍기"
                    onClicked: mapContainer.runJavaScript("mapManager.startDrawing('marker');")
                }

                Button {
                    text: "그리기 취소"
                    onClicked: mapContainer.runJavaScript("mapManager.stopDrawing();")
                }

                Button {
                    text: "GeoJSON 로드"
                    onClicked: {
                        importDialog.open()
                    }
                }

                Button {
                    text: "3D 뷰어 (Mapbox)"
                    onClicked: {
                        mapContainer.runJavaScript("mapManager.toggle3D();")
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

    FileDialog {
        id: importDialog
        title: "GeoJSON 파일 선택"
        nameFilters: ["GeoJSON files (*.geojson)", "JSON files (*.json)", "All files (*)"]
        onAccepted: {
            // 1. C++을 통해 로컬 파일을 문자열로 읽음
            let fileContent = mapBridge.readTextFile(importDialog.selectedFile.toString())

            // 2. JS로 넘겨서 분석(키 추출) 요청
            // 역슬래시나 따옴표 등 이스케이프 처리가 필요할 수 있으므로,
            // 안전하게 데이터를 넘기기 위해 C++에서 처리하거나 Base64 인코딩을 쓰기도 하지만,
            // 우선 템플릿 리터럴(backtick)로 던집니다.
            let safeContent = fileContent.replace(/`/g, "\\`").replace(/\$/g, "\\$")
            mapContainer.runJavaScript("mapManager.analyzeGeoJson(`" + safeContent + "`);")
        }
    }

    Popup {
        id: textInputPopup
        width: 320
        height: 160
        anchors.centerIn: Overlay.overlay
        modal: true
        focus: true
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside

        background: Rectangle {
            color: "#ffffff"
            radius: 8
            border.color: "#e0e0e0"
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 15

            Label {
                text: "마커에 표시할 텍스트 입력"
                font.pixelSize: 16
                font.bold: true
            }

            TextField {
                id: inputField
                Layout.fillWidth: true
                placeholderText: "예: 도착지, 경유지 등"
                onAccepted: sendButton.clicked()
            }

            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: 10

                Button {
                    text: "취소"
                    onClicked: textInputPopup.close()
                }

                Button {
                    id: sendButton
                    text: "확인"
                    highlighted: true
                    onClicked: {
                        let jsCode = "mapManager.addFinalMarkerWithLabel("
                                     + currentMarkerLat + ", "
                                     + currentMarkerLng + ", '"
                                     + inputField.text + "');"

                        mapContainer.runJavaScript(jsCode);

                        textInputPopup.close();
                        inputField.clear();
                    }
                }
            }
        }
    }

    // 속성 매핑 팝업
    Popup {
        id: mappingPopup
        width: 300
        height: 200
        anchors.centerIn: Overlay.overlay
        modal: true

        background: Rectangle {
            color: "#ffffff"
            radius: 8
            border.color: "#e0e0e0"
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 15

            Label {
                text: "표출할 텍스트 속성 선택"
                font.pixelSize: 16
                font.bold: true
            }

            ComboBox {
                id: mappingComboBox
                Layout.fillWidth: true
                // model은 JS에서 넘어온 keys 배열로 동적 채워짐
            }

            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: 10

                Button {
                    text: "취소"
                    onClicked: {
                        mappingPopup.close()
                        // JS측 임시 데이터 초기화 호출
                        mapContainer.runJavaScript("mapManager.tempGeoJsonData = null;")
                    }
                }

                Button {
                    text: "적용"
                    highlighted: true
                    onClicked: {
                        // 3. 선택한 Key 값을 JS로 넘겨 최종 렌더링 명령
                        let selectedKey = mappingComboBox.currentText
                        mapContainer.runJavaScript("mapManager.applyGeoJsonMapping('" + selectedKey + "');")
                        mappingPopup.close()
                    }
                }
            }
        }
    }
}
