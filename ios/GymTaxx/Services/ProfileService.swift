//
//  ProfileService.swift
//  GymTaxx
//

import Foundation
import Supabase

/// Reads and updates the signed-in user's profile. The row itself is created by
/// a database trigger when the account is created, so this only ever updates.
nonisolated enum ProfileService {

    static func fetchProfile() async throws -> Profile? {
        let rows: [Profile] = try await supabase
            .from("profiles")
            .select()
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    /// Persist the "how often do you currently train?" answer and mark onboarding
    /// finished. Called on the first authenticated refresh after signing up.
    static func saveOnboardingAnswers(habit: GymHabit, userId: String) async throws {
        try await supabase
            .from("profiles")
            .update(ProfileOnboardingUpdate(
                currentWorkoutsPerWeek: habit.dbValue,
                onboardingCompleted: true
            ))
            .eq("id", value: userId)
            .execute()
    }
}
