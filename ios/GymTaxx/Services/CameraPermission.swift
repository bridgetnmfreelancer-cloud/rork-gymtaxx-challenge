//
//  CameraPermission.swift
//  GymTaxx
//

import AVFoundation

/// Camera authorisation, kept in one place so the verification flow can ask
/// before presenting the picker rather than opening onto a black screen.
nonisolated enum CameraPermission {

    /// The current authorisation state for video capture.
    static var status: AVAuthorizationStatus {
        AVCaptureDevice.authorizationStatus(for: .video)
    }

    /// True when the user has already blocked the camera, so the only way
    /// forward is Settings.
    static var isBlocked: Bool {
        let status = status
        return status == .denied || status == .restricted
    }

    /// Show the system prompt. Returns whether access was granted.
    static func request() async -> Bool {
        await AVCaptureDevice.requestAccess(for: .video)
    }
}
