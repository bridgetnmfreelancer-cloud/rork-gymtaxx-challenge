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

/// Why a check-in does or doesn't carry a position.
///
/// Stored against the submission so review can tell an indoor gym with no signal
/// apart from someone who switched location off — previously both arrived as empty
/// coordinates and were indistinguishable.
nonisolated enum LocationStatus: String, Sendable, Codable, Hashable {
    /// A fix good enough to place someone at a building.
    case located
    /// A real but coarse fix, or the phone's recent last-known position.
    case approximate
    /// Permission was granted but no usable fix arrived.
    case noSignal = "no_signal"
    /// Permission was refused, so we were never allowed to look.
    case denied
    /// Pre-1.1 rows written before this was recorded.
    case unknown
}

/// The result of one location attempt: a coordinate when we got one, always with
/// a reason attached.
nonisolated struct LocationFix: Sendable, Equatable {
    let coordinate: CapturedLocation?
    let status: LocationStatus

    static let denied = LocationFix(coordinate: nil, status: .denied)
    static let noSignal = LocationFix(coordinate: nil, status: .noSignal)

    /// Grades a live fix by how tight it is.
    init(grading location: CapturedLocation) {
        coordinate = location
        status = location.accuracy <= LocationCapture.goodAccuracy ? .located : .approximate
    }

    /// A position the phone already had. Never counted as fully located: it says
    /// where someone was a moment ago, not where they are now.
    init(cached location: CapturedLocation) {
        coordinate = location
        status = .approximate
    }

    private init(coordinate: CapturedLocation?, status: LocationStatus) {
        self.coordinate = coordinate
        self.status = status
    }
}

/// What the app is currently allowed to do.
nonisolated enum LocationPermission: Sendable {
    /// The user hasn't been asked yet.
    case notAsked
    case granted
    /// Refused or restricted — only the Settings app can change this.
    case blocked
}

/// One-shot location fix, taken alongside the proof photo so review can tell
/// whether a check-in happened at a gym.
///
/// Two rules shape this class:
///
/// 1. **A weak signal must never cost someone money.** Gyms are basements and
///    steel-framed boxes. Every failure path still returns a `LocationFix`, so the
///    check-in always proceeds — tagged for review rather than blocked.
/// 2. **Silence is worse than refusal.** A missing position is always explained,
///    because "declined" and "couldn't get a signal" need completely different
///    responses from us.
@MainActor
final class LocationCapture: NSObject {

    /// A fix this tight or better places someone at a building.
    ///
    /// Deliberately loose. Asking for ten metres indoors usually returns nothing at
    /// all, and nothing is far less useful for review than "within a block".
    static let goodAccuracy: Double = 150

    /// How long to wait for a fresh fix.
    ///
    /// Longer than Core Location's own ~10s give-up on a single request, so we no
    /// longer walk away while iOS is still looking — the previous 8s all but
    /// guaranteed we gave up first.
    private static let fixTimeout: Duration = .seconds(20)

    /// Cap on waiting for the user to answer the system prompt, so a dialog left
    /// on screen can't wedge a check-in forever.
    private static let permissionTimeout: Duration = .seconds(60)

    /// How recent the phone's cached position must be to stand in for a fresh fix.
    private static let cacheLifetime: TimeInterval = 5 * 60

    private let manager = CLLocationManager()
    private var fixContinuation: CheckedContinuation<CapturedLocation?, Never>?
    private var authContinuation: CheckedContinuation<LocationPermission, Never>?

    /// The in-flight attempt, so a fix started early can be awaited later.
    private var pending: Task<LocationFix, Never>?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
    }

    /// What we're currently allowed to do.
    var permission: LocationPermission {
        switch manager.authorizationStatus {
        case .notDetermined: return .notAsked
        case .authorizedWhenInUse, .authorizedAlways: return .granted
        case .denied, .restricted: return .blocked
        @unknown default: return .blocked
        }
    }

    /// True once the user has made a choice we can't change from inside the app.
    var isBlocked: Bool { permission == .blocked }

    /// Ask for permission, for use on a calm screen with an explanation on it.
    /// Returns the resulting state; already-answered returns immediately.
    func requestPermission() async -> LocationPermission {
        let current = permission
        guard current == .notAsked else { return current }

        let result = await withTimeout(Self.permissionTimeout) { [weak self] in
            await self?.awaitAuthorizationChange()
        }
        return result ?? permission
    }

    /// Start looking for a position now, before it's needed.
    ///
    /// Called when the camera opens so the lookup overlaps the 10-20 seconds
    /// someone spends framing a photo. By submit time the answer is normally
    /// already in hand, which is what stops location from adding delay.
    func prewarm() {
        guard pending == nil else { return }
        pending = Task { [weak self] in
            await self?.resolveFix() ?? .noSignal
        }
    }

    /// The position for this check-in, reusing a prewarmed lookup when there is one.
    func fix() async -> LocationFix {
        let task = pending ?? Task { [weak self] in
            await self?.resolveFix() ?? .noSignal
        }
        pending = task
        let result = await task.value
        pending = nil
        return result
    }

    private func resolveFix() async -> LocationFix {
        switch permission {
        case .blocked:
            return .denied
        case .notAsked:
            let granted = await requestPermission()
            guard granted == .granted else {
                return granted == .blocked ? .denied : .noSignal
            }
        case .granted:
            break
        }

        if let fresh = await withTimeout(Self.fixTimeout, { [weak self] in
            await self?.requestFix()
        }) {
            return LocationFix(grading: fresh)
        }

        // Falling back to what the phone already knows. Previously this was thrown
        // away, so a failed lookup recorded nothing even when a perfectly usable
        // recent position was sitting in memory.
        if let cached = recentCachedLocation() {
            return LocationFix(cached: cached)
        }
        return .noSignal
    }

    /// The phone's last known position, if it's recent enough to mean anything.
    private func recentCachedLocation() -> CapturedLocation? {
        guard let last = manager.location,
              last.horizontalAccuracy >= 0,
              Date().timeIntervalSince(last.timestamp) <= Self.cacheLifetime else { return nil }
        return CapturedLocation(
            latitude: last.coordinate.latitude,
            longitude: last.coordinate.longitude,
            accuracy: last.horizontalAccuracy
        )
    }

    private func awaitAuthorizationChange() async -> LocationPermission {
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

    /// Races work against a deadline so a stalled GPS or an unanswered prompt can't
    /// hold up a submission. `nil` means the deadline won.
    private func withTimeout<T: Sendable>(
        _ duration: Duration,
        _ work: @escaping @MainActor () async -> T?
    ) async -> T? {
        await withTaskGroup(of: T?.self) { group in
            group.addTask { await work() }
            group.addTask {
                try? await Task.sleep(for: duration)
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

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            // Fires once on creation too, so ignore anything that isn't an answer.
            guard permission != .notAsked, let continuation = authContinuation else { return }
            authContinuation = nil
            continuation.resume(returning: permission)
        }
    }

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        // A negative accuracy means the coordinate is invalid, not merely coarse.
        let fix = locations.last
            .filter { $0.horizontalAccuracy >= 0 }
            .map {
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

private extension Optional {
    /// Keeps a wrapped value only when it passes a test.
    func filter(_ isIncluded: (Wrapped) -> Bool) -> Wrapped? {
        guard let value = self, isIncluded(value) else { return nil }
        return value
    }
}
