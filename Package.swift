// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "WattwerkKit",
    platforms: [
        .macOS(.v14),
        .tvOS(.v17),
        .iOS(.v17),
    ],
    products: [
        .library(name: "WattwerkCore", targets: ["WattwerkCore"]),
        .library(name: "WattwerkBluetooth", targets: ["WattwerkBluetooth"]),
        .library(name: "WattwerkUI", targets: ["WattwerkUI"]),
    ],
    targets: [
        // Pure domain logic: workouts, the ride engine, metrics, persistence.
        // No CoreBluetooth, no SwiftUI - runs and tests everywhere.
        .target(name: "WattwerkCore"),

        // CoreBluetooth transport: FTMS trainer, heart rate strap, power meter.
        .target(name: "WattwerkBluetooth", dependencies: ["WattwerkCore"]),

        // SwiftUI layer shared by the macOS and tvOS apps.
        .target(name: "WattwerkUI", dependencies: ["WattwerkCore", "WattwerkBluetooth"]),

        .testTarget(name: "WattwerkCoreTests", dependencies: ["WattwerkCore"]),
        .testTarget(name: "WattwerkBluetoothTests", dependencies: ["WattwerkBluetooth"]),
    ],
    swiftLanguageModes: [.v6]
)
