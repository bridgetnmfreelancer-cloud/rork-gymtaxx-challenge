//
//  ChallengeStore.swift
//  GymTaxx
//

import Foundation
import SwiftUI

/// Observable store for the user's challenge.
///
/// Remote Supabase submissions are the source of truth for check-ins, verified
/// totals and money earned. The challenge *configuration* (deposit, reward,
/// dates, shared id) is cached locally so the home screen can render instantly,
/// but workout rows are never seeded locally — they come only from Supabase.
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

            var updated = Challenge(
                depositAmount: remote.depositAmount,
                rewardPerWorkout: remote.rewardPerWorkout,
                startDate: remote.startDate,
                workoutsPerWeek: remote.workoutsPerWeek,
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
