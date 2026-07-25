//
//  Profile.swift
//  GymTaxx
//

import Foundation

/// Durable facts about a user. Created automatically by a database trigger when
/// the account is created, so the client only ever updates it.
///
/// Deliberately holds no challenge commitment: the goal changes month to month
/// and lives on `user_challenges` instead.
nonisolated struct Profile: Codable, Identifiable, Sendable, Hashable {
    let id: String
    let name: String?
    let email: String?
    let avatarUrl: String?
    let currentWorkoutsPerWeek: String?
    let onboardingCompleted: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case email
        case avatarUrl = "avatar_url"
        case currentWorkoutsPerWeek = "current_workouts_per_week"
        case onboardingCompleted = "onboarding_completed"
    }

    var habit: GymHabit? {
        currentWorkoutsPerWeek.flatMap(GymHabit.init(dbValue:))
    }
}

/// Partial profile update written after onboarding.
nonisolated struct ProfileOnboardingUpdate: Encodable, Sendable {
    let currentWorkoutsPerWeek: String
    let onboardingCompleted: Bool

    enum CodingKeys: String, CodingKey {
        case currentWorkoutsPerWeek = "current_workouts_per_week"
        case onboardingCompleted = "onboarding_completed"
    }
}
