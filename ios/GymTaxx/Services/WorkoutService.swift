//
//  WorkoutService.swift
//  GymTaxx
//

import Foundation
import UIKit
import Supabase

/// Errors surfaced to the verification UI.
nonisolated enum WorkoutServiceError: LocalizedError {
    case notSignedIn
    case imageEncodingFailed
    /// Upload to Storage failed, before the DB row was created.
    case uploadFailed
    /// DB insert failed after the photo uploaded successfully.
    case recordCreationFailed

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "You need to be signed in to submit a workout."
        case .imageEncodingFailed: return "We couldn't process that photo. Please try again."
        case .uploadFailed:
            return "Your photo couldn't be uploaded. Check your connection and try again."
        case .recordCreationFailed:
            return "We couldn't save your submission. Please try again."
        }
    }
}

/// Handles the remote workout flow: upload proof to private Storage, then create
/// the pending submission row. Also reads the challenge and the user's
/// participation record.
nonisolated enum WorkoutService {

    private static let bucket = "workout-proofs"

    /// Fetch the challenge participants are currently joining (the earliest one).
    static func fetchChallenge() async throws -> RemoteChallenge {
        try await supabase
            .from("challenges")
            .select()
            .order("created_at", ascending: true)
            .limit(1)
            .single()
            .execute()
            .value
    }

    /// Fetch the signed-in user's participation record for a challenge, or nil if
    /// they haven't joined it. RLS limits the result to the caller's own row.
    static func fetchParticipation(challengeId: UUID) async throws -> UserChallenge? {
        let rows: [UserChallenge] = try await supabase
            .from("user_challenges")
            .select()
            .eq("challenge_id", value: challengeId.uuidString)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    /// Join a challenge with the goal chosen during onboarding. Payment and
    /// lifecycle status use server defaults (`unpaid` / `active`).
    static func createParticipation(
        userId: String,
        challenge: RemoteChallenge,
        goal: WeeklyGoal,
        startedAt: Date = Date()
    ) async throws -> UserChallenge {
        try await supabase
            .from("user_challenges")
            .insert(UserChallengeInsert(
                userId: userId,
                challengeId: challenge.id,
                goal: goal,
                startedAt: startedAt,
                weeks: challenge.numberOfWeeks
            ))
            .select()
            .single()
            .execute()
            .value
    }

    /// Fetch the submissions belonging to one participation record.
    static func fetchSubmissions(userChallengeId: UUID) async throws -> [WorkoutSubmission] {
        try await supabase
            .from("workout_submissions")
            .select()
            .eq("user_challenge_id", value: userChallengeId.uuidString)
            .order("captured_at", ascending: false)
            .execute()
            .value
    }

    /// Upload the proof photo then create the pending submission row.
    ///
    /// If the upload succeeds but the DB insert fails, we make a single attempt
    /// to delete the just-uploaded object so it doesn't become an orphan. If that
    /// delete also fails we log it and surface a retry error to the user. No
    /// automated cleanup job — this is intentionally simple for the MVP.
    /// `location` is optional on purpose: a missing fix is recorded as null and
    /// reviewed manually rather than blocking the check-in.
    static func submitWorkout(
        image: UIImage,
        userId: String,
        challengeId: UUID,
        userChallengeId: UUID,
        capturedAt: Date,
        location: CapturedLocation?
    ) async throws {
        guard let data = image.jpegData(compressionQuality: 0.7) else {
            throw WorkoutServiceError.imageEncodingFailed
        }

        // Supabase Storage RLS compares the folder name as text against
        // auth.uid()::text, which Postgres returns lowercase. Swift's uuidString is
        // uppercase, so we must lowercase the id or the own-folder policy 403s.
        let path = "\(userId.lowercased())/\(UUID().uuidString.lowercased()).jpg"

        // 1. Upload the proof image.
        do {
            try await supabase.storage
                .from(bucket)
                .upload(path, data: data, options: FileOptions(contentType: "image/jpeg"))
        } catch {
            #if DEBUG
            NSLog("%@", "GymTaxx submit: storage upload failed at \(bucket)/\(path): \(String(reflecting: error))")
            #endif
            throw WorkoutServiceError.uploadFailed
        }

        // 2. Create the pending DB row. On failure, try once to remove the image.
        do {
            try await supabase
                .from("workout_submissions")
                .insert(WorkoutSubmissionInsert(
                    userId: userId,
                    challengeId: challengeId,
                    userChallengeId: userChallengeId,
                    capturedAt: capturedAt,
                    storagePath: path,
                    latitude: location?.latitude,
                    longitude: location?.longitude,
                    locationAccuracyM: location?.accuracy
                ))
                .execute()
        } catch {
            #if DEBUG
            NSLog("%@", "GymTaxx submit: db insert failed after upload for \(bucket)/\(path): \(String(reflecting: error))")
            #endif
            do {
                _ = try await supabase.storage.from(bucket).remove(paths: [path])
            } catch {
                // Best-effort orphan cleanup only; nothing more to do for the MVP.
                #if DEBUG
                NSLog("%@", "GymTaxx submit: orphan cleanup delete failed for \(bucket)/\(path): \(String(reflecting: error))")
                #endif
            }
            throw WorkoutServiceError.recordCreationFailed
        }
    }
}
