//
//  ChallengeStore.swift
//  GymTaxx
//

import Foundation
import SwiftUI

/// Observable store holding the user's challenge state, persisted to the
/// app's documents directory as JSON.
@Observable
final class ChallengeStore {

    private(set) var challenge: Challenge
    private let saveURL: URL

    init(saveURL: URL? = nil) {
        if let saveURL {
            self.saveURL = saveURL
        } else {
            let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            self.saveURL = docs.appendingPathComponent("gymtaxx_challenge.json")
        }

        if let data = try? Data(contentsOf: self.saveURL),
           let decoded = try? JSONDecoder().decode(Challenge.self, from: data) {
            self.challenge = decoded
        } else {
            // MVP demo state: a fresh challenge with one verified workout this
            // week so the home screen feels alive on first launch.
            let now = Date()
            let cal = Calendar.current
            let start = cal.date(byAdding: .day, value: -2, to: now) ?? now
            var fresh = Challenge(depositAmount: 60, rewardPerWorkout: 5, startDate: start)
            fresh.workouts = [
                Workout(capturedAt: cal.date(byAdding: .hour, value: -20, to: now) ?? now,
                        status: .verified, weekIndex: 0)
            ]
            self.challenge = fresh
            persist()
        }
    }

    /// Adds a freshly captured workout as pending verification.
    func addPendingWorkout(capturedAt: Date = Date()) {
        let week = ChallengeEngine.currentWeekIndex(for: challenge)
        let workout = Workout(capturedAt: capturedAt, status: .pending, weekIndex: week)
        challenge.workouts.append(workout)
        persist()
    }

    /// Marks the most recent pending workout as verified (manual MVP path).
    func verifyMostRecentPendingWorkout() {
        guard let index = challenge.workouts.lastIndex(where: { $0.status == .pending }) else { return }
        challenge.workouts[index].status = .verified
        persist()
    }

    /// Convenience accessors derived from the engine.
    var currentWeek: Int { ChallengeEngine.currentWeekIndex(for: challenge) }
    var completedThisWeek: Int { ChallengeEngine.completedThisWeek(for: challenge) }
    var remainingThisWeek: Int { ChallengeEngine.remainingWorkoutsThisWeek(for: challenge) }
    var streak: Int { ChallengeEngine.currentStreak(for: challenge) }
    var workoutsThisWeek: [Workout] { ChallengeEngine.workoutsThisWeek(for: challenge) }
    var earnedSoFar: Double { ChallengeEngine.earnedSoFar(for: challenge) }
    var earnedProgress: Double { ChallengeEngine.earnedProgress(for: challenge) }
    var totalVerified: Int { ChallengeEngine.totalVerified(for: challenge) }
    var totalWorkoutsToEarnBack: Int { ChallengeEngine.totalWorkoutsToEarnBack(for: challenge) }

    private func persist() {
        do {
            let data = try JSONEncoder().encode(challenge)
            try data.write(to: saveURL, options: [.atomic])
        } catch {
            print("GymTaxx: failed to persist challenge: \(error)")
        }
    }
}
