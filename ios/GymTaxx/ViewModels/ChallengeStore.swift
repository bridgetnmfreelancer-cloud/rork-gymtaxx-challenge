//
//  ChallengeStore.swift
//  GymTaxx
//

import Foundation
import SwiftUI
import Supabase

/// Observable store for the user's challenge.
///
/// Remote Supabase submissions are the source of truth for check-ins, verified
/// totals and money earned. The challenge *configuration* (deposit, reward,
/// dates, shared id) is cached locally so the home screen can render instantly,
/// but workout rows are never seeded locally — they come only from Supabase.
///
/// The deposit and weekly target come from the user's own `challenge_enrollments`
/// row, which is created from the goal they picked during onboarding. The shared
/// `challenges` row only supplies its defaults as a fallback.
@Observable
@MainActor
final class ChallengeStore {

    private(set) var challenge: Challenge
    private(set) var challengeId: UUID?
    private(set) var isLoading = false
    private(set) var loadError: String?

    private let saveURL: URL

    init(saveURL: URL? = nil) {
        if let saveURL {
            self.saveURL = saveURL
        } else {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            self.saveURL = docs.appendingPathComponent("gymtaxx_challenge.json")
        }

        // Load cached challenge *config* only. Workouts always start empty and
        // are populated from remote submissions on refresh.
        if let data = try? Data(contentsOf: self.saveURL),
           let decoded = try? JSONDecoder().decode(Challenge.self, from: data) {
            var cached = decoded
            cached.workouts = []
            self.challenge = cached
        } else {
            self.challenge = Challenge(depositAmount: 60, rewardPerWorkout: 5)
        }
    }

    /// Fetch the shared challenge and this user's submissions from Supabase and
    /// rebuild the local view. Remote data fully replaces any in-memory workouts.
    func refresh() async {
        isLoading = true
        loadError = nil
        do {
            let remote = try await WorkoutService.fetchChallenge()
            challengeId = remote.id

            let enrollment = await resolveEnrollment(for: remote)

            var updated = Challenge(
                depositAmount: enrollment?.depositAmount ?? remote.depositAmount,
                rewardPerWorkout: remote.rewardPerWorkout,
                startDate: remote.startDate,
                workoutsPerWeek: enrollment?.workoutsPerWeek ?? remote.workoutsPerWeek,
                numberOfWeeks: remote.numberOfWeeks
            )

            let submissions = try await WorkoutService.fetchSubmissions(challengeId: remote.id)
            updated.workouts = submissions.map { submission in
                Workout(
                    id: submission.id,
                    capturedAt: submission.capturedAt,
                    status: submission.workoutStatus,
                    weekIndex: Self.weekIndex(for: submission.capturedAt, start: remote.startDate)
                )
            }

            challenge = updated
            persistConfig()
        } catch {
            print("GymTaxx: failed to refresh challenge: \(error.localizedDescription)")
            loadError = "Couldn't load your challenge. Pull to refresh to try again."
        }
        isLoading = false
    }

    /// Clear in-memory workout data (e.g. on sign out) so one user's data can't
    /// bleed into another session.
    func clear() {
        challenge.workouts = []
        challengeId = nil
        loadError = nil
    }

    // MARK: - Derived accessors (unchanged engine math)

    var currentWeek: Int { ChallengeEngine.currentWeekIndex(for: challenge) }
    var completedThisWeek: Int { ChallengeEngine.completedThisWeek(for: challenge) }
    var remainingThisWeek: Int { ChallengeEngine.remainingWorkoutsThisWeek(for: challenge) }
    var streak: Int { ChallengeEngine.currentStreak(for: challenge) }
    var workoutsThisWeek: [Workout] { ChallengeEngine.workoutsThisWeek(for: challenge) }
    var earnedSoFar: Double { ChallengeEngine.earnedSoFar(for: challenge) }
    var earnedProgress: Double { ChallengeEngine.earnedProgress(for: challenge) }
    var totalVerified: Int { ChallengeEngine.totalVerified(for: challenge) }
    var totalWorkoutsToEarnBack: Int { ChallengeEngine.totalWorkoutsToEarnBack(for: challenge) }

    // MARK: - Enrolment

    /// The user's enrolment for this challenge, creating it on first sign-in from
    /// the goal saved during onboarding.
    ///
    /// A failure here is deliberately non-fatal: the home screen still renders on
    /// the shared challenge defaults and the next refresh retries.
    private func resolveEnrollment(for remote: RemoteChallenge) async -> ChallengeEnrollment? {
        do {
            if let existing = try await WorkoutService.fetchEnrollment(challengeId: remote.id) {
                // The server row wins from now on, so drop the local hand-off value.
                Self.clearPendingGoal()
                return existing
            }

            guard let userId = supabase.auth.currentUser?.id.uuidString,
                  let goal = Self.pendingGoal() else { return nil }

            let created = try await WorkoutService.createEnrollment(
                userId: userId,
                challengeId: remote.id,
                goal: goal
            )
            Self.clearPendingGoal()
            return created
        } catch {
            print("GymTaxx: failed to resolve enrolment: \(error.localizedDescription)")
            return nil
        }
    }

    /// The goal chosen during onboarding, held in UserDefaults until there's an
    /// account to attach it to. Cleared once it reaches the server so a different
    /// user signing in on this device can't inherit it.
    private static func pendingGoal() -> WeeklyGoal? {
        let raw = UserDefaults.standard.integer(forKey: OnboardingStorage.weeklyGoalKey)
        return WeeklyGoal(rawValue: raw)
    }

    private static func clearPendingGoal() {
        UserDefaults.standard.removeObject(forKey: OnboardingStorage.weeklyGoalKey)
    }

    // MARK: - Helpers

    private static func weekIndex(for date: Date, start: Date) -> Int {
        let days = Calendar.current.dateComponents([.day], from: start, to: date).day ?? 0
        return max(0, days) / 7
    }

    private func persistConfig() {
        do {
            let data = try JSONEncoder().encode(challenge)
            try data.write(to: saveURL, options: [.atomic])
        } catch {
            print("GymTaxx: failed to persist challenge config: \(error.localizedDescription)")
        }
    }
}
