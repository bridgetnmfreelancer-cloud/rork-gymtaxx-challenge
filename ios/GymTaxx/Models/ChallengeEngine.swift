//
//  ChallengeEngine.swift
//  GymTaxx
//

import Foundation

/// Pure logic for deriving challenge progress from a `Challenge`.
enum ChallengeEngine {

    /// The 0-based index of the current week of the challenge (0...numberOfWeeks-1).
    /// Weeks are calendar weeks running Monday to Sunday. Clamps to the last week
    /// if the challenge has ended.
    static func currentWeekIndex(for challenge: Challenge) -> Int {
        let week = GymWeek.index(for: Date(), start: challenge.startDate)
        return min(week, max(0, challenge.numberOfWeeks - 1))
    }

    /// Workouts that count toward the current week (verified only).
    static func verifiedWorkoutsThisWeek(for challenge: Challenge) -> [Workout] {
        let week = currentWeekIndex(for: challenge)
        return challenge.workouts.filter { $0.weekIndex == week && $0.status == .verified }
    }

    /// Workouts submitted this week (any status), newest first.
    static func workoutsThisWeek(for challenge: Challenge) -> [Workout] {
        let week = currentWeekIndex(for: challenge)
        return challenge.workouts
            .filter { $0.weekIndex == week }
            .sorted { $0.capturedAt > $1.capturedAt }
    }

    /// Check-ins rejected during the current week, newest first.
    ///
    /// Surfaced to the user because a rejection silently earns them nothing —
    /// without a prompt, the first they'd know of it is a smaller refund.
    static func rejectedWorkoutsThisWeek(for challenge: Challenge) -> [Workout] {
        let week = currentWeekIndex(for: challenge)
        return challenge.workouts
            .filter { $0.weekIndex == week && $0.status == .rejected }
            .sorted { $0.capturedAt > $1.capturedAt }
    }

    /// The Sunday that closes the current challenge week.
    static func currentWeekEnd(for challenge: Challenge) -> Date {
        GymWeek.lastDay(ofWeek: currentWeekIndex(for: challenge), start: challenge.startDate)
    }

    /// Number of remaining workouts needed this week to hit the target.
    static func remainingWorkoutsThisWeek(for challenge: Challenge) -> Int {
        let done = verifiedWorkoutsThisWeek(for: challenge).count
        return max(0, challenge.workoutsPerWeek - done)
    }

    /// Number of workouts completed (verified) this week.
    static func completedThisWeek(for challenge: Challenge) -> Int {
        verifiedWorkoutsThisWeek(for: challenge).count
    }

    /// Current consecutive-week streak: number of weeks (ending at the current
    /// week) where the user hit the target.
    static func currentStreak(for challenge: Challenge) -> Int {
        let currentWeek = currentWeekIndex(for: challenge)
        guard currentWeek >= 0 else { return 0 }

        var streak = 0
        // Walk back from the most recent *completed* week.
        var week = currentWeek
        // If the current week isn't finished yet but already hit, count it.
        // Otherwise start from the previous fully-elapsed week.
        if completedThisWeek(for: challenge) >= challenge.workoutsPerWeek {
            streak += 1
            week -= 1
        } else if week == 0 {
            return 0
        } else {
            week -= 1
        }

        while week >= 0 {
            let count = challenge.workouts.filter {
                $0.weekIndex == week && $0.status == .verified
            }.count
            if count >= challenge.workoutsPerWeek {
                streak += 1
                week -= 1
            } else {
                break
            }
        }
        return streak
    }

    /// Total verified workouts across the whole challenge.
    static func totalVerified(for challenge: Challenge) -> Int {
        challenge.workouts.filter { $0.status == .verified }.count
    }

    /// Money earned back so far: the reward per verified workout, capped at the
    /// deposit. Currency-agnostic — the numbers are identical in either currency.
    static func earnedSoFar(for challenge: Challenge) -> Double {
        let earned = Double(totalVerified(for: challenge)) * challenge.rewardPerWorkout
        return min(earned, challenge.depositAmount)
    }

    /// Total workouts required to earn the full deposit back.
    static func totalWorkoutsToEarnBack(for challenge: Challenge) -> Int {
        guard challenge.rewardPerWorkout > 0 else { return 0 }
        return Int((challenge.depositAmount / challenge.rewardPerWorkout).rounded(.up))
    }

    /// Fraction of the deposit earned back so far (0...1).
    static func earnedProgress(for challenge: Challenge) -> Double {
        guard challenge.depositAmount > 0 else { return 0 }
        return min(1.0, earnedSoFar(for: challenge) / challenge.depositAmount)
    }

    /// True if the challenge is over and the user met every week's target.
    static func isChallengeComplete(_ challenge: Challenge) -> Bool {
        let totalNeeded = challenge.workoutsPerWeek * challenge.numberOfWeeks
        // Simple version: all weeks must have hit target.
        guard challenge.workouts.count >= totalNeeded else { return false }
        for week in 0..<challenge.numberOfWeeks {
            let count = challenge.workouts.filter {
                $0.weekIndex == week && $0.status == .verified
            }.count
            if count < challenge.workoutsPerWeek { return false }
        }
        return true
    }
}
