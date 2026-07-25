//
//  ChallengeEnrollment.swift
//  GymTaxx
//

import Foundation

/// A user's personal terms for the shared challenge: the weekly goal they picked
/// during onboarding and the deposit it implies (goal x 4 weeks x GBP 5).
///
/// The `challenges` row holds what everyone shares (start date, reward per
/// workout, length). This row holds what differs per person. A DB CHECK
/// constraint enforces `deposit_amount == workouts_per_week * 20`, so a client
/// can't enrol itself on cheaper terms than the goal it chose.
nonisolated struct ChallengeEnrollment: Codable, Identifiable, Sendable, Hashable {
    let id: UUID
    let userId: String
    let challengeId: UUID
    let workoutsPerWeek: Int
    let depositAmount: Double
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case challengeId = "challenge_id"
        case workoutsPerWeek = "workouts_per_week"
        case depositAmount = "deposit_amount"
        case createdAt = "created_at"
    }
}

/// The payload a user inserts to enrol themselves. The deposit is derived from
/// the weekly goal rather than passed in independently.
nonisolated struct ChallengeEnrollmentInsert: Encodable, Sendable {
    let userId: String
    let challengeId: UUID
    let workoutsPerWeek: Int
    let depositAmount: Double

    init(userId: String, challengeId: UUID, goal: WeeklyGoal) {
        self.userId = userId
        self.challengeId = challengeId
        self.workoutsPerWeek = goal.rawValue
        self.depositAmount = Double(goal.depositAmount)
    }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case challengeId = "challenge_id"
        case workoutsPerWeek = "workouts_per_week"
        case depositAmount = "deposit_amount"
    }
}
