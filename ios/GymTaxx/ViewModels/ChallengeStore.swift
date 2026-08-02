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
    /// The user's commitment to the current challenge, including whether their
    /// deposit has been paid.
    private(set) var participation: UserChallenge?
    private(set) var isLoading = false
    private(set) var loadError: String?
    /// True when the user is signed in but hasn't committed to a weekly goal yet
    /// (e.g. they signed up on another device, or reinstalled the app).
    private(set) var needsGoal = false

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

            let outcome = await resolveParticipation(for: remote)

            guard case .joined(let participation) = outcome else {
                // Keep showing cached config rather than inventing numbers, and
                // let the next refresh retry.
                self.participation = nil
                needsGoal = (outcome == .needsGoal)
                if !needsGoal {
                    loadError = "We couldn't load your challenge place. Pull to refresh to try again."
                }
                isLoading = false
                return
            }

            needsGoal = false
            self.participation = participation

            var updated = Challenge(
                depositAmount: Self.deposit(for: participation, challenge: remote),
                rewardPerWorkout: remote.rewardPerWorkout,
                startDate: participation.startedAt,
                workoutsPerWeek: participation.goalWorkoutsPerWeek,
                numberOfWeeks: remote.numberOfWeeks
            )

            // Nothing to show until the deposit is paid — an unpaid user isn't in
            // the challenge yet, and the database refuses their submissions anyway.
            let submissions = participation.payment == .paid
                ? try await WorkoutService.fetchSubmissions(userChallengeId: participation.id)
                : []
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
        participation = nil
        needsGoal = false
        loadError = nil
    }

    /// The participation record id — the parent of every submission.
    var participationId: UUID? { participation?.id }

    /// True while the user has committed to a goal but not yet paid the deposit.
    /// The challenge stays locked until this is false.
    var needsDeposit: Bool { participation?.payment == .unpaid }

    /// True once the deposit has actually been taken.
    var hasPaidDeposit: Bool { participation?.payment == .paid }

    /// Poll for the deposit being marked paid after a successful Stripe payment.
    ///
    /// Stripe confirms payment to its webhook, not to the app, so there is a short
    /// gap between the sheet closing and the record flipping to `paid`. Returns
    /// false if it hasn't landed yet so the caller can offer a retry.
    func awaitDepositConfirmation(attempts: Int = 6) async -> Bool {
        for attempt in 0..<attempts {
            if attempt > 0 {
                try? await Task.sleep(for: .milliseconds(1500))
            }
            await refresh()
            if participation?.payment == .paid { return true }
        }
        return false
    }

    // MARK: - Derived accessors (unchanged engine math)

    var currentWeek: Int { ChallengeEngine.currentWeekIndex(for: challenge) }
    var completedThisWeek: Int { ChallengeEngine.completedThisWeek(for: challenge) }
    var remainingThisWeek: Int { ChallengeEngine.remainingWorkoutsThisWeek(for: challenge) }
    var streak: Int { ChallengeEngine.currentStreak(for: challenge) }
    var workoutsThisWeek: [Workout] { ChallengeEngine.workoutsThisWeek(for: challenge) }
    var rejectedThisWeek: [Workout] { ChallengeEngine.rejectedWorkoutsThisWeek(for: challenge) }
    var currentWeekEnd: Date { ChallengeEngine.currentWeekEnd(for: challenge) }
    var earnedSoFar: Double { ChallengeEngine.earnedSoFar(for: challenge) }
    var earnedProgress: Double { ChallengeEngine.earnedProgress(for: challenge) }
    var totalVerified: Int { ChallengeEngine.totalVerified(for: challenge) }
    var totalWorkoutsToEarnBack: Int { ChallengeEngine.totalWorkoutsToEarnBack(for: challenge) }

    /// The Monday this user's challenge begins.
    var startDate: Date { challenge.startDate }

    /// False while a paid-up user is waiting for their Monday. Check-ins must be
    /// blocked until then, otherwise a photo taken before day one would count
    /// towards week one.
    var hasStarted: Bool { Date() >= challenge.startDate }

    /// Whole days until the challenge opens (0 once it has).
    var daysUntilStart: Int {
        guard !hasStarted else { return 0 }
        let days = GymWeek.calendar.dateComponents(
            [.day],
            from: GymWeek.calendar.startOfDay(for: Date()),
            to: challenge.startDate
        ).day ?? 0
        return max(0, days)
    }

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
    private func resolveParticipation(for remote: RemoteChallenge) async -> ParticipationOutcome {
        do {
            if let existing = try await WorkoutService.fetchParticipation(challengeId: remote.id) {
                // The server row wins from now on, so drop the local hand-off value.
                Self.clearPendingGoal()
                return .joined(existing)
            }

            guard let userId = supabase.auth.currentUser?.id.uuidString else {
                return .failed
            }

            // No goal waiting on this device: the account exists but the choice was
            // never made here, so ask for it rather than dead-ending.
            guard let goal = Self.pendingGoal() else { return .needsGoal }

            let created = try await WorkoutService.createParticipation(
                userId: userId,
                challenge: remote,
                goal: goal
            )
            Self.clearPendingGoal()
            return .joined(created)
        } catch {
            print("GymTaxx: failed to resolve participation: \(error.localizedDescription)")
            return .failed
        }
    }

    /// Commit to a weekly goal, creating the participation record. Used when the
    /// signed-in account has no commitment yet, so the deposit can be priced.
    @discardableResult
    func commit(goal: WeeklyGoal) async -> Bool {
        isLoading = true
        loadError = nil
        do {
            guard let userId = supabase.auth.currentUser?.id.uuidString else {
                loadError = "You need to be signed in to join the challenge."
                isLoading = false
                return false
            }
            let remote = try await WorkoutService.fetchChallenge()
            _ = try await WorkoutService.createParticipation(
                userId: userId,
                challenge: remote,
                goal: goal
            )
            Self.clearPendingGoal()
            isLoading = false
            await refresh()
            return participation != nil
        } catch {
            print("GymTaxx: failed to commit to goal: \(error.localizedDescription)")
            loadError = "We couldn't save your commitment. Please try again."
            isLoading = false
            return false
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
        GymWeek.index(for: date, start: start)
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
