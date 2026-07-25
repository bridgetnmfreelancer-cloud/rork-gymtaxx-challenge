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
    /// Still sent because `workout_submissions.challenge_id` is NOT NULL until
    /// that now-redundant column is dropped. `user_challenge_id` is the real link.
    let challengeId: UUID
    let userChallengeId: UUID
    let capturedAt: Date
    let storagePath: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case challengeId = "challenge_id"
        case userChallengeId = "user_challenge_id"
        case capturedAt = "captured_at"
        case storagePath = "storage_path"
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
