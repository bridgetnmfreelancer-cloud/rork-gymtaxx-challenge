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

    var isSignedIn: Bool { userId != nil }

    init() {
        Task { await observeSession() }
    }

    /// Restore any persisted session and keep `userId` in sync with auth changes.
    private func observeSession() async {
        for await state in supabase.auth.authStateChanges {
            userId = state.session?.user.id.uuidString
            if isLoading { isLoading = false }
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

    // TODO: Password reset is deferred for the initial MVP build. It is REQUIRED
    // before the wider beta — register the rork-<projectId>://auth/callback URL
    // scheme, call supabase.auth.resetPasswordForEmail, handle the deep link in
    // onOpenURL, and present a "set new password" screen.
}
