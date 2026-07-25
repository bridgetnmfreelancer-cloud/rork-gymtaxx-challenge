//
//  ParticipationOutcome.swift
//  GymTaxx
//

import Foundation

/// The result of looking up (or creating) the user's place in the challenge.
///
/// `needsGoal` is deliberately separate from `failed`: a signed-in account with
/// no commitment isn't an error, it's a question we still need to ask.
nonisolated enum ParticipationOutcome: Equatable, Sendable {
    case joined(UserChallenge)
    case needsGoal
    case failed
}
