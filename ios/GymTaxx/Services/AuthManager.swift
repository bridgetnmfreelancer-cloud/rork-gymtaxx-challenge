//
//  AuthManager.swift
//  GymTaxx
//

import Foundation
import Supabase

/// Observable holder for the Supabase auth session. supabase-swift persists the
/// session in the Keychain and auto-refreshes tokens, so we just mirror its
/// state and expose sign up / sign in / sign out.
@Observable
@MainActor
final class AuthManager {

    /// The signed-in user's id, or nil when logged out.
    private(set) var userId: String?
    /// True until the initial session restore completes, so the UI can show a splash.
    private(set) var isLoading = true

    /// Suppresses session mirroring while a password recovery is in flight.
    ///
    /// Verifying a recovery token signs the user in as a side effect. Without this
    /// flag the app would jump to the challenge mid-reset, tearing down the reset
    /// screen before the new password is saved.
    private var isCompletingRecovery = false

    var isSignedIn: Bool { userId != nil }

    init() {
        Task { await observeSession() }
    }

    /// Restore any persisted session and keep `userId` in sync with auth changes.
    private func observeSession() async {
        for await state in supabase.auth.authStateChanges {
            if isLoading { isLoading = false }
            guard !isCompletingRecovery else { continue }
            userId = state.session?.user.id.uuidString
        }
    }

    /// Create a new account. Email confirmation is disabled for the MVP, so this
    /// returns an active session immediately.
    func signUp(email: String, password: String) async throws {
        _ = try await supabase.auth.signUp(email: email, password: password)
    }

    func signIn(email: String, password: String) async throws {
        _ = try await supabase.auth.signIn(email: email, password: password)
    }

    func signOut() async {
        do {
            try await supabase.auth.signOut()
        } catch {
            print("GymTaxx: sign out failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Password reset

    /// Send the recovery email. Always call this before `completePasswordReset`.
    ///
    /// No `redirectTo` is passed: the app has no registered URL scheme, so the
    /// user brings the token back from the email by hand rather than via a deep
    /// link. See `PasswordResetView` for the user-facing half of this.
    func sendPasswordReset(email: String) async throws {
        try await supabase.auth.resetPasswordForEmail(email)
    }

    /// Verify the recovery token from the email and set the new password.
    ///
    /// Verifying creates a short-lived session, which is the only way Supabase
    /// will accept a password change. We sign out immediately afterwards so the
    /// user has to prove the new password works — and so a half-finished reset
    /// can never leave someone signed in with a password they don't know.
    func completePasswordReset(email: String, token: String, newPassword: String) async throws {
        isCompletingRecovery = true
        defer { isCompletingRecovery = false }

        do {
            if Self.isSixDigitCode(token) {
                try await supabase.auth.verifyOTP(email: email, token: token, type: .recovery)
            } else {
                try await supabase.auth.verifyOTP(tokenHash: token, type: .recovery)
            }
        } catch {
            #if DEBUG
            NSLog("%@", "GymTaxx reset: token verification failed: \(String(reflecting: error))")
            #endif
            throw PasswordResetError.invalidToken
        }

        do {
            try await supabase.auth.update(user: UserAttributes(password: newPassword))
        } catch {
            #if DEBUG
            NSLog("%@", "GymTaxx reset: password update failed: \(String(reflecting: error))")
            #endif
            // Don't leave the recovery session open on a failed change.
            try? await supabase.auth.signOut()
            throw PasswordResetError.updateFailed
        }

        try? await supabase.auth.signOut()
        userId = nil
    }

    /// Pull the recovery token out of whatever the user pasted.
    ///
    /// Accepts a full Supabase verification link (`?token=` or `?token_hash=`),
    /// an app-style link carrying `code=`, or a bare token typed by hand.
    static func recoveryToken(from input: String) -> String? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        if let components = URLComponents(string: trimmed),
           let items = components.queryItems {
            for key in ["token_hash", "token", "code"] {
                if let value = items.first(where: { $0.name == key })?.value,
                   !value.isEmpty {
                    return value
                }
            }
        }

        // Not a link — treat it as the token itself, but don't accept a stray word.
        return trimmed.contains(" ") ? nil : trimmed
    }

    private static func isSixDigitCode(_ token: String) -> Bool {
        token.count == 6 && token.allSatisfy(\.isNumber)
    }
}

/// Failures surfaced by the password reset screen.
nonisolated enum PasswordResetError: LocalizedError {
    case invalidToken
    case updateFailed

    var errorDescription: String? {
        switch self {
        case .invalidToken:
            return "That reset link has expired or was already used. Request a new email and try again."
        case .updateFailed:
            return "We couldn't save your new password. Please request a new email and try again."
        }
    }
}
