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
    /// Upload to Storage failed (before DB insert). `detail` carries raw diagnostics.
    case uploadFailed(detail: String)
    /// DB insert failed (after upload succeeded). `detail` carries raw diagnostics.
    case recordCreationFailed(detail: String)

    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "You need to be signed in to submit a workout."
        case .imageEncodingFailed: return "We couldn't process that photo. Please try again."
        case let .uploadFailed(detail):
            return "Your photo couldn't be uploaded (Storage stage).\n\n\(detail)"
        case let .recordCreationFailed(detail):
            return "We couldn't save your submission (database stage).\n\n\(detail)"
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
        // --- Diagnostics: identity & session state before we touch Storage ---
        let sessionUserId = supabase.auth.currentUser?.id.uuidString
        let hasSession = supabase.auth.currentSession != nil
        NSLog("%@", """
        GymTaxx[submit] --- begin ---
          passed userId:        \(userId)
          session user id:      \(sessionUserId ?? "<nil: no current user>")
          has active session:   \(hasSession)
          ids match:            \(sessionUserId == userId)
          challengeId:          \(challengeId.uuidString)
          bucket:               \(bucket)
        """)

        guard let data = image.jpegData(compressionQuality: 0.7) else {
            NSLog("%@", "GymTaxx[submit] FAILED at stage: IMAGE ENCODING (before Storage). Could not build JPEG data.")
            throw WorkoutServiceError.imageEncodingFailed
        }

        let path = "\(userId)/\(UUID().uuidString).jpg"
        NSLog("%@", """
        GymTaxx[submit] image encoded OK
          jpeg byte count:      \(data.count)
          full storage path:    \(bucket)/\(path)
        """)

        // 1. Upload the proof image.
        do {
            NSLog("%@", "GymTaxx[submit] stage 1: uploading to Storage at path '\(path)' in bucket '\(bucket)'...")
            try await supabase.storage
                .from(bucket)
                .upload(path, data: data, options: FileOptions(contentType: "image/jpeg"))
            NSLog("%@", "GymTaxx[submit] stage 1: Storage upload SUCCEEDED for '\(bucket)/\(path)'")
        } catch {
            let detail = """
            stage: STORAGE UPLOAD (before DB insert)
            bucket: \(bucket)
            path: \(path)
            userId: \(userId)
            session: \(sessionUserId ?? "nil") | active: \(hasSession) | match: \(sessionUserId == userId)
            error: \(error.localizedDescription)
            raw: \(String(reflecting: error))
            """
            NSLog("%@", "GymTaxx[submit] FAILED\n\(detail)")
            throw WorkoutServiceError.uploadFailed(detail: detail)
        }

        // 2. Create the pending DB row. On failure, try once to remove the image.
        do {
            NSLog("%@", "GymTaxx[submit] stage 2: inserting workout_submissions row (upload already succeeded)...")
            try await supabase
                .from("workout_submissions")
                .insert(WorkoutSubmissionInsert(
                    userId: userId,
                    challengeId: challengeId,
                    capturedAt: capturedAt,
                    storagePath: path
                ))
                .execute()
            NSLog("%@", "GymTaxx[submit] stage 2: DB insert SUCCEEDED. --- done ---")
        } catch {
            NSLog("%@", """
            GymTaxx[submit] FAILED at stage: DATABASE INSERT (AFTER Storage upload succeeded).
              bucket:             \(bucket)
              full path:          \(bucket)/\(path)
              user id used:       \(userId)
              localizedError:     \(error.localizedDescription)
              full error:         \(String(reflecting: error))
            """)
            do {
                NSLog("%@", "GymTaxx[submit] attempting orphan cleanup delete of '\(bucket)/\(path)'...")
                _ = try await supabase.storage.from(bucket).remove(paths: [path])
                NSLog("%@", "GymTaxx[submit] orphan cleanup delete SUCCEEDED for '\(bucket)/\(path)'")
            } catch {
                // Best-effort cleanup only; nothing more to do for the MVP.
                NSLog("%@", """
                GymTaxx[submit] orphan cleanup delete FAILED for '\(bucket)/\(path)':
                  localizedError:   \(error.localizedDescription)
                  full error:       \(String(reflecting: error))
                """)
            }
            let detail = """
            stage: DATABASE INSERT (upload already succeeded)
            bucket: \(bucket)
            path: \(path)
            userId: \(userId)
            session: \(sessionUserId ?? "nil") | active: \(hasSession) | match: \(sessionUserId == userId)
            error: \(error.localizedDescription)
            raw: \(String(reflecting: error))
            """
            throw WorkoutServiceError.recordCreationFailed(detail: detail)
        }
    }
}
