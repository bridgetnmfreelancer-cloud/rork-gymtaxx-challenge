//
//  UserChallenge.swift
//  GymTaxx
//

import Foundation

/// A user's participation in one challenge: their commitment and lifecycle for
/// that challenge only.
///
/// The `challenges` row holds what everyone shares (name, dates, reward per
/// workout, length). This row holds what is specific to one person's run at it,
/// so committing to 4/week in August and 5/week in September produces two
/// independent records and history never rewrites itself.
///
/// Deposit and total required workouts are intentionally absent — both are
/// derived from `goalWorkoutsPerWeek` and the challenge's length/reward.
nonisolated struct UserChallenge: Codable, Identifiable, Sendable, Hashable {
    let id: UUID
    let userId: String
    let challengeId: UUID
    let goalWorkoutsPerWeek: Int
    let paymentStatus: String
    let challengeStatus: String
    let startedAt: Date
    let endsAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case challengeId = "challenge_id"
        case goalWorkoutsPerWeek = "goal_workouts_per_week"
        case paymentStatus = "payment_status"
        case challengeStatus = "challenge_status"
        case startedAt = "started_at"
        case endsAt = "ends_at"
    }

    var payment: PaymentStatus { PaymentStatus(rawValue: paymentStatus) ?? .unpaid }
    var status: ParticipationStatus { ParticipationStatus(rawValue: challengeStatus) ?? .active }
}

/// Deposit lifecycle for a participation record.
/// Refunds are issued by hand in the Stripe Dashboard, so the app only ever
/// needs to know whether the deposit has been taken.
nonisolated enum PaymentStatus: String, Codable, Sendable {
    case unpaid
    case paid
}

/// Lifecycle of the participation itself, independent of whether the user hit
/// their goal (that is derived from verified submissions).
nonisolated enum ParticipationStatus: String, Codable, Sendable {
    case active
    case completed
    case abandoned
}

/// Payload for enrolling in a challenge. Payment and status are omitted so the
/// server defaults apply — RLS only accepts `unpaid` + `active` from a client,
/// so a user can never mark their own deposit as paid.
nonisolated struct UserChallengeInsert: Encodable, Sendable {
    let userId: String
    let challengeId: UUID
    let goalWorkoutsPerWeek: Int
    let startedAt: Date
    let endsAt: Date

    /// Snaps the start forward to the next monthly cohort — the first Monday of
    /// the month — so everyone taking part runs the same four weeks and reviews
    /// have one set of week boundaries rather than one per user.
    init(userId: String, challengeId: UUID, goal: WeeklyGoal, startedAt: Date, weeks: Int) {
        let start = GymWeek.cohortStart(onOrAfter: startedAt)
        self.userId = userId
        self.challengeId = challengeId
        self.goalWorkoutsPerWeek = goal.rawValue
        self.startedAt = start
        self.endsAt = GymWeek.calendar.date(
            byAdding: .day,
            value: weeks * 7,
            to: start
        ) ?? start.addingTimeInterval(Double(weeks) * 7 * 86_400)
    }

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case challengeId = "challenge_id"
        case goalWorkoutsPerWeek = "goal_workouts_per_week"
        case startedAt = "started_at"
        case endsAt = "ends_at"
    }
}
