//
//  ChallengeModels.swift
//  GymTaxx
//

import Foundation

/// Verification status of a single workout submission.
enum WorkoutStatus: String, Codable, CaseIterable {
    case pending
    case verified
    case rejected
}

/// A single workout verification attempt captured by the user.
struct Workout: Identifiable, Codable, Hashable {
    let id: UUID
    let capturedAt: Date
    var status: WorkoutStatus
    let weekIndex: Int

    init(
        id: UUID = UUID(),
        capturedAt: Date = Date(),
        status: WorkoutStatus = .pending,
        weekIndex: Int
    ) {
        self.id = id
        self.capturedAt = capturedAt
        self.status = status
        self.weekIndex = weekIndex
    }
}

/// The full state of a user's 4-week gym challenge.
struct Challenge: Codable {
    var depositAmount: Double
    var rewardPerWorkout: Double
    var startDate: Date
    var workoutsPerWeek: Int
    var numberOfWeeks: Int
    var workouts: [Workout]

    init(
        depositAmount: Double = 60,
        rewardPerWorkout: Double = 5,
        startDate: Date = Date(),
        workoutsPerWeek: Int = 3,
        numberOfWeeks: Int = 4,
        workouts: [Workout] = []
    ) {
        self.depositAmount = depositAmount
        self.rewardPerWorkout = rewardPerWorkout
        self.startDate = startDate
        self.workoutsPerWeek = workoutsPerWeek
        self.numberOfWeeks = numberOfWeeks
        self.workouts = workouts
    }

    /// Decodes older saved challenges that predate `rewardPerWorkout`.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        depositAmount = try container.decodeIfPresent(Double.self, forKey: .depositAmount) ?? 60
        rewardPerWorkout = try container.decodeIfPresent(Double.self, forKey: .rewardPerWorkout) ?? 5
        startDate = try container.decode(Date.self, forKey: .startDate)
        workoutsPerWeek = try container.decode(Int.self, forKey: .workoutsPerWeek)
        numberOfWeeks = try container.decode(Int.self, forKey: .numberOfWeeks)
        workouts = try container.decode([Workout].self, forKey: .workouts)
    }
}
