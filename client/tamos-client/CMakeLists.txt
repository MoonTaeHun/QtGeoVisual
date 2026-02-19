cmake_minimum_required(VERSION 3.16)

# 프로젝트 설정
project(tamos_client VERSION 0.1 LANGUAGES CXX)

# [핵심 해결책] RelWithDebInfo 모드에서 최적화를 끄고 디버깅 정보만 남깁니다.
# 이렇게 하면 지도 속도는 빠르지만(라이브러리는 릴리즈), 내 코드는 변수가 다 보입니다.
if(MSVC)
    # Windows (MSVC) 컴파일러 설정
    # /Od: 최적화 끄기 (변수 보임)
    # /Zi: 디버그 정보 생성
    # /Ob0: 인라인 함수 확장 끄기
    set(CMAKE_CXX_FLAGS_RELWITHDEBINFO "/Od /Zi /Ob0 /DNDEBUG" CACHE STRING "" FORCE)
else()
    # GCC/Clang (Linux/macOS) 설정
    set(CMAKE_CXX_FLAGS_RELWITHDEBINFO "-O0 -g" CACHE STRING "" FORCE)
endif()

# 1. 자동 컴파일 도구 활성화 (메타데이터 및 MOC 에러 방지)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 2. 필요한 Qt 컴포넌트 로드
find_package(Qt6 REQUIRED COMPONENTS Quick Network WebEngineQuick WebEngineCore Network)

# Qt 정책 설정 (QML 리소스 관련 경고 해결)
qt_policy(SET QTP0001 NEW)
qt_standard_project_setup()

# 3. 실행 파일(.exe) 타겟 생성 (핵심 수정 사항)
# 라이브러리가 아닌 독립 실행 파일을 만들기 위해 명시합니다.
qt_add_executable(mytamos_client
    main.cpp
    src/ApiHandler.h
    src/MapBridge.h
    src/ApiHandler.cpp
    src/MapBridge.cpp
)

# 4. QML 모듈 설정
# 위에서 만든 mytamos_client 타겟에 QML 파일을 등록합니다.
qt_add_qml_module(mytamos_client
    URI Tamos
    VERSION 1.0
    QML_FILES
        qml/main.qml
)

# 5. 라이브러리 링크
target_link_libraries(mytamos_client PRIVATE
    Qt6::Quick
    Qt6::Network
    Qt6::WebEngineQuick
    Qt6::WebEngineCore
)

# 6. 실행 파일 출력 경로 설정
# 빌드 폴더 루트에 .exe가 생성되도록 보장합니다.
set_target_properties(mytamos_client PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
)

# mapweb 폴더 전체(하위 js, css 포함)를 빌드 디렉토리로 복사
file(COPY "${CMAKE_CURRENT_SOURCE_DIR}/mapweb" DESTINATION "${CMAKE_BINARY_DIR}")
