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
/// totals and money earned. The challenge *configuration* is cached locally so
/// the home screen can render instantly, but workout rows are never seeded
/// locally — they come only from Supabase.
///
/// Shape of the data:
/// - `challenges` supplies what everyone shares: length, reward per workout, name.
/// - `user_challenges` supplies this user's commitment: goal per week and window.
/// - The deposit is *derived* (goal x weeks x reward), never stored twice.
@Observable
@MainActor
final class ChallengeStore {

    private(set) var challenge: Challenge
    private(set) var challengeId: UUID?
    /// The user's participation record id — the parent of every submission.
    private(set) var participationId: UUID?
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

    /// Fetch the challenge, the user's participation and their submissions, then
    /// rebuild the local view. Remote data fully replaces in-memory workouts.
    func refresh() async {
        isLoading = true
        loadError = nil
        do {
            let remote = try await WorkoutService.fetchChallenge()
            challengeId = remote.id

            await syncProfileIfNeeded()

            guard let participation = await resolveParticipation(for: remote) else {
                // Not enrolled yet (or enrolment failed) — keep showing cached
                // config rather than inventing numbers, and let the next refresh retry.
                participationId = nil
                loadError = "We couldn't load your challenge place. Pull to refresh to try again."
                isLoading = false
                return
            }

            participationId = participation.id

            var updated = Challenge(
                depositAmount: Self.deposit(for: participation, challenge: remote),
                rewardPerWorkout: remote.rewardPerWorkout,
                startDate: participation.startedAt,
                workoutsPerWeek: participation.goalWorkoutsPerWeek,
                numberOfWeeks: remote.numberOfWeeks
            )

            let submissions = try await WorkoutService.fetchSubmissions(
                userChallengeId: participation.id
            )
            updated.workouts = submissions.map { submission in
                Workout(
                    id: submission.id,
                    capturedAt: submission.capturedAt,
                    status: submission.workoutStatus,
                    weekIndex: Self.weekIndex(
                        for: submission.capturedAt,
                        start: participation.startedAt
                    )
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
        participationId = nil
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

    // MARK: - Participation

    /// The deposit implied by the user's commitment. Derived rather than stored,
    /// so it can never drift from the goal it was calculated from.
    private static func deposit(for participation: UserChallenge, challenge: RemoteChallenge) -> Double {
        Double(participation.goalWorkoutsPerWeek)
            * Double(challenge.numberOfWeeks)
            * challenge.rewardPerWorkout
    }

    /// The user's participation record, creating it on first sign-in from the goal
    /// chosen during onboarding.
    private func resolveParticipation(for remote: RemoteChallenge) async -> UserChallenge? {
        do {
            if let existing = try await WorkoutService.fetchParticipation(challengeId: remote.id) {
                // The server row wins from now on, so drop the local hand-off value.
                Self.clearPendingGoal()
                return existing
            }

            guard let userId = supabase.auth.currentUser?.id.uuidString,
                  let goal = Self.pendingGoal() else { return nil }

            let created = try await WorkoutService.createParticipation(
                userId: userId,
                challenge: remote,
                goal: goal
            )
            Self.clearPendingGoal()
            return created
        } catch {
            print("GymTaxx: failed to resolve participation: \(error.localizedDescription)")
            return nil
        }
    }

    /// Write the onboarding habit answer to the profile once, then forget it locally.
    private func syncProfileIfNeeded() async {
        guard let raw = UserDefaults.standard.string(forKey: OnboardingStorage.habitKey),
              let habit = GymHabit(dbValue: raw),
              let userId = supabase.auth.currentUser?.id.uuidString else { return }
        do {
            try await ProfileService.saveOnboardingAnswers(habit: habit, userId: userId)
            UserDefaults.standard.removeObject(forKey: OnboardingStorage.habitKey)
        } catch {
            print("GymTaxx: failed to sync profile: \(error.localizedDescription)")
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
