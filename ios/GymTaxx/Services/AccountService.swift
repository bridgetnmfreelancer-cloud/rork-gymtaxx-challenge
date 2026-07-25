//
//  AccountService.swift
//  GymTaxx
//

import Foundation
import Supabase

nonisolated struct DeleteAccountResult: Codable, Sendable {
    let status: String

    var isDeleted: Bool { status == "deleted" }
}

nonisolated enum AccountServiceError: LocalizedError {
    case deleteFailed

    var errorDescription: String? {
        switch self {
        case .deleteFailed:
            return "We couldn't delete your account. Check your connection and try again, or email support@gymtaxx.com."
        }
    }
}

/// Account-level actions that need server privileges.
nonisolated enum AccountService {

    /// Permanently delete the signed-in user's account, workout history, and
    /// proof photos.
    ///
    /// A client can't delete its own `auth.users` row, so this calls the
    /// `delete-account` edge function, which identifies the caller from their
    /// JWT — there is no user id to pass or tamper with.
    static func deleteAccount() async throws {
        do {
            let result: DeleteAccountResult = try await supabase.functions.invoke(
                "delete-account",
                options: .init(method: .post)
            )
            guard result.isDeleted else { throw AccountServiceError.deleteFailed }
        } catch {
            #if DEBUG
            NSLog("%@", "GymTaxx account: delete-account failed: \(String(reflecting: error))")
            #endif
            throw AccountServiceError.deleteFailed
        }
    }
}
