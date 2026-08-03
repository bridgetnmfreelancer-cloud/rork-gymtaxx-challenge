//
//  WorkoutSubmission.swift
//  GymTaxx
//

import Foundation

/// A remote workout submission row from Supabase (source of truth for check-ins).
nonisolated struct WorkoutSubmission: Codable, Identifiable, Sendable, Hashable {
    let id: UUID
    let userId: String
    /// The participation record this submission belongs to.
    let userChallengeId: UUID
    let capturedAt: Date
    let storagePath: String
    let status: String
    let createdAt: Date
    let reviewedAt: Date?
    let rejectionReason: String?
    /// Nil when location was unavailable or declined at capture time.
    let latitude: Double?
    let longitude: Double?
    let locationAccuracyM: Double?
    /// Why this check-in does or doesn't carry a position. Optional only so rows
    /// written before 1.1 still decode.
    let locationStatus: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case userChallengeId = "user_challenge_id"
        case capturedAt = "captured_at"
        case storagePath = "storage_path"
        case status
        case createdAt = "created_at"
        case reviewedAt = "reviewed_at"
        case rejectionReason = "rejection_reason"
        case latitude
        case longitude
        case locationAccuracyM = "location_accuracy_m"
        case locationStatus = "location_status"
    }

    /// Whether this submission carries a coordinate for review to check.
    var hasLocation: Bool {
        latitude != nil && longitude != nil
    }

    /// The recorded reason, falling back to `unknown` for anything unrecognised.
    var locationState: LocationStatus {
        locationStatus.flatMap(LocationStatus.init(rawValue:)) ?? .unknown
    }

    /// Maps the string status to the app's `WorkoutStatus` enum, defaulting to
    /// pending for any unexpected value.
    var workoutStatus: WorkoutStatus {
        WorkoutStatus(rawValue: status) ?? .pending
    }
}

/// The payload participants insert. Status is forced to pending and review
/// fields are omitted — RLS rejects anything else.
nonisolated struct WorkoutSubmissionInsert: Encodable, Sendable {
    let userId: String
    /// The only link to the challenge. The old `challenge_id` column was dropped,
    /// so sending it made PostgREST reject every insert — never send it again.
    let userChallengeId: UUID
    let capturedAt: Date
    let storagePath: String
    /// Null when no fix was obtained — `locationStatus` carries the reason so an
    /// indoor dead spot is never confused with a refusal.
    let latitude: Double?
    let longitude: Double?
    let locationAccuracyM: Double?
    let locationStatus: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case userChallengeId = "user_challenge_id"
        case capturedAt = "captured_at"
        case storagePath = "storage_path"
        case latitude
        case longitude
        case locationAccuracyM = "location_accuracy_m"
        case locationStatus = "location_status"
    }
}

/// The challenge itself (e.g. "August Challenge"), shared by all participants
/// and independent of any individual user.
///
/// Per-user values (goal, deposit) are deliberately absent — they live on
/// `user_challenges`.
nonisolated struct RemoteChallenge: Codable, Identifiable, Sendable {
    let id: UUID
    let name: String
    let rewardPerWorkout: Double
    let numberOfWeeks: Int
    let startDate: Date

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case rewardPerWorkout = "reward_per_workout"
        case numberOfWeeks = "number_of_weeks"
        case startDate = "start_date"
    }
}
