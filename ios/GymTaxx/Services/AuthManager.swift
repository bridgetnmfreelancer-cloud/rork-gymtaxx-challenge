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
    /// The signed-in user's email, for display on the account screen.
    private(set) var userEmail: String?
    /// True until the initial session restore completes, so the UI can show a splash.
    private(set) var isLoading = true

    /// True once a recovery deep link has produced a session, meaning the user
    /// must choose a new password before doing anything else.
    ///
    /// Opening a recovery link signs the user in as a side effect, so `isSignedIn`
    /// alone would drop them straight into the challenge holding a password they
    /// don't know. `RootView` checks this flag *before* `isSignedIn` to keep them
    /// on the new-password screen instead.
    private(set) var isRecoveringPassword = false

    /// Set while a recovery link is being exchanged, so the UI can show progress.
    private(set) var isHandlingRecoveryLink = false

    /// Surfaces a failed recovery link on whichever screen is visible.
    var recoveryLinkError: String?

    var isSignedIn: Bool { userId != nil }

    /// Where Supabase sends the user after they tap the link in the recovery
    /// email. The `gymtaxx` scheme is registered in `ios/Info.plist`, and this
    /// exact string is allow-listed in Supabase under
    /// Authentication -> URL Configuration -> Redirect URLs.
    static let recoveryRedirect = URL(string: "gymtaxx://reset-password")!

    init() {
        Task { await observeSession() }
    }

    /// Restore any persisted session and keep `userId` in sync with auth changes.
    private func observeSession() async {
        for await state in supabase.auth.authStateChanges {
            if isLoading { isLoading = false }
            userId = state.session?.user.id.uuidString
            userEmail = state.session?.user.email

            // Supabase flags recovery sessions explicitly, which also covers the
            // SDK restoring one before our deep-link handler gets to run.
            if state.event == .passwordRecovery {
                isRecoveringPassword = true
            }
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

    // MARK: - Account deletion

    /// Permanently delete the account, then drop back to the logged-out state.
    ///
    /// The on-device onboarding answers are cleared too, so a deleted user starts
    /// from a genuinely clean slate rather than inheriting the old goal.
    func deleteAccount() async throws {
        try await AccountService.deleteAccount()

        let defaults = UserDefaults.standard
        defaults.removeObject(forKey: OnboardingStorage.completedKey)
        defaults.removeObject(forKey: OnboardingStorage.weeklyGoalKey)
        defaults.removeObject(forKey: OnboardingStorage.habitKey)

        // The server already destroyed the user, so this only clears the local
        // session. It can fail harmlessly — the session is already dead — so we
        // force the logged-out state regardless.
        await signOut()
        userId = nil
        userEmail = nil
    }

    // MARK: - Password reset

    /// Email the user a recovery link that opens this app.
    ///
    /// `redirectTo` is what keeps the link out of Safari. Without it Supabase
    /// falls back to the project's Site URL and the link dead-ends in a browser.
    func sendPasswordReset(email: String) async throws {
        try await supabase.auth.resetPasswordForEmail(
            email,
            redirectTo: Self.recoveryRedirect
        )
    }

    /// Handle a `gymtaxx://` deep link. Returns true when the URL was ours.
    ///
    /// supabase-swift defaults to the PKCE flow, so the link arrives carrying a
    /// `code` that `session(from:)` exchanges for a session using the verifier
    /// stored on this device. That device binding is a security property, not a
    /// bug — it also means the reset must finish on the phone that started it.
    @discardableResult
    func handleOpenURL(_ url: URL) async -> Bool {
        guard url.scheme?.lowercased() == Self.recoveryRedirect.scheme else { return false }

        isHandlingRecoveryLink = true
        defer { isHandlingRecoveryLink = false }
        recoveryLinkError = nil

        do {
            try await supabase.auth.session(from: url)
            isRecoveringPassword = true
        } catch {
            #if DEBUG
            NSLog("%@", "GymTaxx reset: recovery link exchange failed: \(String(reflecting: error))")
            #endif
            recoveryLinkError = PasswordResetError.invalidLink.localizedDescription
        }
        return true
    }

    /// Save the new password for the recovery session opened by the deep link.
    ///
    /// Signs out afterwards so the user proves the new password works, and so a
    /// half-finished reset can't leave someone signed in through a spent link.
    func finishPasswordReset(newPassword: String) async throws {
        do {
            try await supabase.auth.update(user: UserAttributes(password: newPassword))
        } catch {
            #if DEBUG
            NSLog("%@", "GymTaxx reset: password update failed: \(String(reflecting: error))")
            #endif
            throw PasswordResetError.updateFailed
        }

        await signOut()
        isRecoveringPassword = false
    }

    /// Abandon a recovery session without changing the password.
    func cancelPasswordReset() async {
        await signOut()
        isRecoveringPassword = false
        recoveryLinkError = nil
    }
}

/// Failures surfaced by the password reset screen.
nonisolated enum PasswordResetError: LocalizedError {
    case invalidLink
    case updateFailed

    var errorDescription: String? {
        switch self {
        case .invalidLink:
            return "That reset link has expired or was already used. Request a new email, and open it on this phone — that's where the reset was started."
        case .updateFailed:
            return "We couldn't save your new password. Request a new email and try again."
        }
    }
}
