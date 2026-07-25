//
//  OnboardingModels.swift
//  GymTaxx
//

import Foundation

/// How often the user currently trains (onboarding question 1).
nonisolated enum GymHabit: String, CaseIterable, Identifiable {
    case inconsistent
    case onceAWeek
    case twiceAWeek
    case threeTimesAWeek
    case fourPlusAWeek

    var id: String { rawValue }

    var label: String {
        switch self {
        case .inconsistent: return "Inconsistent (on and off)"
        case .onceAWeek: return "1 time a week"
        case .twiceAWeek: return "2 times a week"
        case .threeTimesAWeek: return "3 times a week"
        case .fourPlusAWeek: return "4 or more times a week"
        }
    }

    /// Value stored in `profiles.current_workouts_per_week`. Text rather than a
    /// number because "inconsistent" and "4 or more" aren't single integers.
    var dbValue: String {
        switch self {
        case .inconsistent: return "inconsistent"
        case .onceAWeek: return "1_per_week"
        case .twiceAWeek: return "2_per_week"
        case .threeTimesAWeek: return "3_per_week"
        case .fourPlusAWeek: return "4_plus_per_week"
        }
    }

    init?(dbValue: String) {
        guard let match = GymHabit.allCases.first(where: { $0.dbValue == dbValue }) else {
            return nil
        }
        self = match
    }
}

/// The weekly workout goal the user commits to (onboarding question 2).
/// Drives the deposit amount: workouts per week x 4 weeks x GBP 5.
nonisolated enum WeeklyGoal: Int, CaseIterable, Identifiable {
    case three = 3
    case four = 4
    case five = 5

    var id: Int { rawValue }

    var label: String { "\(rawValue) times a week" }

    var totalWorkouts: Int { rawValue * 4 }

    var depositAmount: Int { totalWorkouts * 5 }
}

/// UserDefaults keys holding onboarding answers between the pre-account
/// onboarding flow and the first authenticated sync that writes them to Supabase.
nonisolated enum OnboardingStorage {
    static let completedKey = "gymtaxx_onboarding_complete"
    static let weeklyGoalKey = "gymtaxx_weekly_goal"
    static let habitKey = "gymtaxx_current_habit"
}
