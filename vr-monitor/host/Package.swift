// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "vrmonitor",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "vrmonitor", targets: ["vrmonitor"])],
    dependencies: [
        .package(url: "https://github.com/hummingbird-project/hummingbird.git", from: "2.28.0"),
        .package(url: "https://github.com/hummingbird-project/hummingbird-websocket.git", from: "2.8.0"),
        .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.8.0"),
        .package(url: "https://github.com/apple/swift-http-types.git", from: "1.4.0"),
    ],
    targets: [
        // Independente de plataforma: protocolo, auth, interfaces, fonte sintética. Compila no Linux.
        .target(name: "HostCore"),
        // Implementações macOS (ScreenCaptureKit, VideoToolbox, CGEvent). Vazio fora do macOS.
        // Headers da API privada CGVirtualDisplay (só tem conteúdo no macOS).
        .target(name: "CGVirtualDisplayBridge"),
        .target(name: "HostMac", dependencies: [
            "HostCore",
            .target(name: "CGVirtualDisplayBridge", condition: .when(platforms: [.macOS])),
        ]),
        .executableTarget(
            name: "vrmonitor",
            dependencies: [
                "HostCore", "HostMac",
                .product(name: "Hummingbird", package: "hummingbird"),
                .product(name: "HummingbirdWebSocket", package: "hummingbird-websocket"),
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
                .product(name: "HTTPTypes", package: "swift-http-types"),
            ]
        ),
        .testTarget(name: "HostCoreTests", dependencies: ["HostCore"]),
    ],
    swiftLanguageModes: [.v5]
)
