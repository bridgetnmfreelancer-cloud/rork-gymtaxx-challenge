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
/// the pending submission row. Fetches a user's submissions for the home screen.
nonisolated enum WorkoutService {

    private static let bucket = "workout-proofs"

    /// Fetch the shared challenge all participants use (the earliest one).
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

    /// Fetch the signed-in user's submissions for a challenge.
    static func fetchSubmissions(challengeId: UUID) async throws -> [WorkoutSubmission] {
        try await supabase
            .from("workout_submissions")
            .select()
            .eq("challenge_id", value: challengeId.uuidString)
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
    static func submitWorkout(
        image: UIImage,
        userId: String,
        challengeId: UUID,
        capturedAt: Date
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
                    capturedAt: capturedAt,
                    storagePath: path
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
