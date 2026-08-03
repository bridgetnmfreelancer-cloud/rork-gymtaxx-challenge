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
    /// The money this challenge was priced and charged in, fixed when the person
    /// joined. Every amount shown for this participation must use it, so a refund
    /// goes back in the currency that came in.
    let currency: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case challengeId = "challenge_id"
        case goalWorkoutsPerWeek = "goal_workouts_per_week"
        case paymentStatus = "payment_status"
        case challengeStatus = "challenge_status"
        case startedAt = "started_at"
        case endsAt = "ends_at"
        case currency
    }

    var payment: PaymentStatus { PaymentStatus(rawValue: paymentStatus) ?? .unpaid }
    var status: ParticipationStatus { ParticipationStatus(rawValue: challengeStatus) ?? .active }

    /// Never throws on an unfamiliar value — a money label must not be the reason
    /// the home screen fails to render.
    var money: Currency { Currency(storedValue: currency) }
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
    let currency: String

    /// Snaps the start forward to the next Monday, so a joiner waits at most six
    /// days and week boundaries stay on calendar weeks.
    ///
    /// This is the start at *commit* time, which happens before the deposit is
    /// taken. If the deposit lands in a later week the server re-anchors both
    /// dates when it marks the payment paid, so nobody begins a challenge whose
    /// first week is already over.
    init(
        userId: String,
        challengeId: UUID,
        goal: WeeklyGoal,
        startedAt: Date,
        weeks: Int,
        currency: Currency = .forCurrentRegion
    ) {
        let start = GymWeek.weeklyStart(onOrAfter: startedAt)
        self.userId = userId
        self.challengeId = challengeId
        self.goalWorkoutsPerWeek = goal.rawValue
        self.currency = currency.rawValue
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
        case currency
    }
}
