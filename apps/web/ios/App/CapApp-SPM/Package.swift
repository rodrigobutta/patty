// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.3"),
        .package(name: "CapacitorCamera", path: "../../../../../node_modules/.pnpm/@capacitor+camera@8.2.5_@capacitor+core@8.5.3/node_modules/@capacitor/camera"),
        .package(name: "CapacitorLocalNotifications", path: "../../../../../node_modules/.pnpm/@capacitor+local-notifications@8.3.1_@capacitor+core@8.5.3/node_modules/@capacitor/local-notifications"),
        .package(name: "CapacitorPushNotifications", path: "../../../../../node_modules/.pnpm/@capacitor+push-notifications@8.1.3_@capacitor+core@8.5.3/node_modules/@capacitor/push-notifications"),
        .package(name: "CapgoBackgroundGeolocation", path: "../../../../../node_modules/.pnpm/@capgo+background-geolocation@8.4.14_@capacitor+core@8.5.3/node_modules/@capgo/background-geolocation"),
        .package(name: "CapgoCapacitorHealth", path: "../../../../../node_modules/.pnpm/@capgo+capacitor-health@8.11.12_@capacitor+core@8.5.3/node_modules/@capgo/capacitor-health"),
        .package(name: "CapgoCapacitorSocialLogin", path: "../../../../../node_modules/.pnpm/@capgo+capacitor-social-login@8.7.5_@capacitor+core@8.5.3/node_modules/@capgo/capacitor-social-login"),
        .package(name: "CapgoCapacitorSpeechRecognition", path: "../../../../../node_modules/.pnpm/@capgo+capacitor-speech-recognition@8.4.5_@capacitor+core@8.5.3/node_modules/@capgo/capacitor-speech-recognition")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorLocalNotifications", package: "CapacitorLocalNotifications"),
                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),
                .product(name: "CapgoBackgroundGeolocation", package: "CapgoBackgroundGeolocation"),
                .product(name: "CapgoCapacitorHealth", package: "CapgoCapacitorHealth"),
                .product(name: "CapgoCapacitorSocialLogin", package: "CapgoCapacitorSocialLogin"),
                .product(name: "CapgoCapacitorSpeechRecognition", package: "CapgoCapacitorSpeechRecognition")
            ]
        )
    ]
)
