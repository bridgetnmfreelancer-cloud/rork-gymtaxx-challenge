//
//  LocationCapture.swift
//  GymTaxx
//

import CoreLocation
import Foundation

/// Where the device was when a proof photo was taken.
nonisolated struct CapturedLocation: Sendable, Equatable {
    let latitude: Double
    let longitude: Double
    /// Horizontal accuracy in metres. Large values mean a coarse fix.
    let accuracy: Double
}

/// One-shot location fix, taken alongside the proof photo so review can tell
/// whether a check-in happened at a gym.
///
/// Deliberately non-blocking: if the user declines, location is off, or the fix
/// times out, the submission still goes through with no coordinates. The photo
/// remains the primary proof — a missing location is a review signal, not a
/// reason to stop someone earning their deposit back.
@MainActor
final class LocationCapture: NSObject {

    /// How long to wait for a fix before giving up and submitting without one.
    private static let timeout: Duration = .seconds(8)

    private let manager = CLLocationManager()
    private var fixContinuation: CheckedContinuation<CapturedLocation?, Never>?
    private var authContinuation: CheckedContinuation<Bool, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    /// True once the user has made a choice we can't change from inside the app.
    var isBlocked: Bool {
        let status = manager.authorizationStatus
        return status == .denied || status == .restricted
    }

    /// Request a single coordinate, prompting for permission if needed.
    /// Returns nil when unavailable for any reason.
    func currentLocation() async -> CapturedLocation? {
        guard CLLocationManager.locationServicesEnabled() else { return nil }

        if manager.authorizationStatus == .notDetermined {
            let granted = await requestAuthorization()
            guard granted else { return nil }
        }
        guard !isBlocked else { return nil }

        return await withTimeout { [weak self] in
            await self?.requestFix() ?? nil
        }
    }

    private func requestAuthorization() async -> Bool {
        await withCheckedContinuation { continuation in
            authContinuation = continuation
            manager.requestWhenInUseAuthorization()
        }
    }

    private func requestFix() async -> CapturedLocation? {
        await withCheckedContinuation { continuation in
            fixContinuation = continuation
            manager.requestLocation()
        }
    }

    /// Races the fix against a deadline so a stalled GPS can't hang the submit.
    private func withTimeout(
        _ work: @escaping @MainActor () async -> CapturedLocation?
    ) async -> CapturedLocation? {
        await withTaskGroup(of: CapturedLocation?.self) { group in
            group.addTask { await work() }
            group.addTask {
                try? await Task.sleep(for: Self.timeout)
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }

    private func finishFix(with location: CapturedLocation?) {
        fixContinuation?.resume(returning: location)
        fixContinuation = nil
    }
}

extension LocationCapture: CLLocationManagerDelegate {

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didChangeAuthorization status: CLAuthorizationStatus
    ) {
        Task { @MainActor in
            guard status != .notDetermined, let continuation = authContinuation else { return }
            authContinuation = nil
            let granted = status == .authorizedWhenInUse || status == .authorizedAlways
            continuation.resume(returning: granted)
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        let fix = locations.last.map {
            CapturedLocation(
                latitude: $0.coordinate.latitude,
                longitude: $0.coordinate.longitude,
                accuracy: $0.horizontalAccuracy
            )
        }
        Task { @MainActor in finishFix(with: fix) }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didFailWithError error: Error
    ) {
        #if DEBUG
        NSLog("%@", "GymTaxx location: fix failed: \(String(reflecting: error))")
        #endif
        Task { @MainActor in finishFix(with: nil) }
    }
}
