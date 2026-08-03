//
//  ChallengeModels.swift
//  GymTaxx
//

import Foundation

/// Verification status of a single workout submission.
enum WorkoutStatus: String, Codable, CaseIterable {
    case pending
    case verified
    case rejected
}

/// A single workout verification attempt captured by the user.
struct Workout: Identifiable, Codable, Hashable {
    let id: UUID
    let capturedAt: Date
    var status: WorkoutStatus
    let weekIndex: Int
    /// Whether a position was captured with this check-in, and if not, why.
    let locationState: LocationStatus

    init(
        id: UUID = UUID(),
        capturedAt: Date = Date(),
        status: WorkoutStatus = .pending,
        weekIndex: Int,
        locationState: LocationStatus = .unknown
    ) {
        self.id = id
        self.capturedAt = capturedAt
        self.status = status
        self.weekIndex = weekIndex
        self.locationState = locationState
    }

    /// Decodes caches written before check-ins carried a location tag. Without the
    /// fallback the whole cached challenge would fail to decode and the home screen
    /// would launch empty.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        capturedAt = try container.decode(Date.self, forKey: .capturedAt)
        status = try container.decode(WorkoutStatus.self, forKey: .status)
        weekIndex = try container.decode(Int.self, forKey: .weekIndex)
        locationState = try container.decodeIfPresent(LocationStatus.self, forKey: .locationState)
            ?? .unknown
    }
}

/// The full state of a user's 4-week gym challenge.
struct Challenge: Codable {
    var depositAmount: Double
    var rewardPerWorkout: Double
    var startDate: Date
    var workoutsPerWeek: Int
    var numberOfWeeks: Int
    var workouts: [Workout]
    /// Cached alongside the rest of the config so the home screen renders the
    /// right symbol on launch, before the participation record has loaded.
    var currency: Currency
    /// The zone this person's weeks are measured in, cached for the same reason as
    /// the currency: the first render must not use the wrong clock.
    var timeZoneIdentifier: String

    /// Week boundaries for this challenge, on the owner's clock.
    var week: GymWeek { GymWeek(storedIdentifier: timeZoneIdentifier) }

    init(
        depositAmount: Double = 60,
        rewardPerWorkout: Double = 5,
        startDate: Date = Date(),
        workoutsPerWeek: Int = 3,
        numberOfWeeks: Int = 4,
        workouts: [Workout] = [],
        currency: Currency = .forCurrentRegion,
        timeZoneIdentifier: String = TimeZone.current.identifier
    ) {
        self.depositAmount = depositAmount
        self.rewardPerWorkout = rewardPerWorkout
        self.startDate = startDate
        self.workoutsPerWeek = workoutsPerWeek
        self.numberOfWeeks = numberOfWeeks
        self.workouts = workouts
        self.currency = currency
        self.timeZoneIdentifier = timeZoneIdentifier
    }

    /// Decodes older saved challenges that predate `rewardPerWorkout`, `currency`
    /// or `timeZoneIdentifier`.
    ///
    /// A cache written before two-currency support belongs to a UK user, so pounds
    /// and London are the correct fallbacks rather than whatever the phone says
    /// now — the next refresh replaces both with the stored values anyway.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        depositAmount = try container.decodeIfPresent(Double.self, forKey: .depositAmount) ?? 60
        rewardPerWorkout = try container.decodeIfPresent(Double.self, forKey: .rewardPerWorkout) ?? 5
        currency = try container.decodeIfPresent(Currency.self, forKey: .currency) ?? .gbp
        timeZoneIdentifier = try container.decodeIfPresent(String.self, forKey: .timeZoneIdentifier)
            ?? GymWeek.defaultZoneIdentifier
        startDate = try container.decode(Date.self, forKey: .startDate)
        workoutsPerWeek = try container.decode(Int.self, forKey: .workoutsPerWeek)
        numberOfWeeks = try container.decode(Int.self, forKey: .numberOfWeeks)
        workouts = try container.decode([Workout].self, forKey: .workouts)
    }
}
