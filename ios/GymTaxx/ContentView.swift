//
//  ContentView.swift
//  GymTaxx
//

import SwiftUI

/// Auth gate: first-time visitors see the onboarding flow, returning
/// logged-out users see the sign-in flow, and signed-in users see the app.
/// supabase-swift restores any persisted session on launch.
///
/// Password recovery is checked before everything else: a recovery deep link
/// creates a real session, so without that ordering the user would land in the
/// challenge holding a password they don't know.
struct RootView: View {
    @Bindable var auth: AuthManager

    @AppStorage(OnboardingStorage.completedKey) private var hasOnboarded = false
    @State private var wantsLogIn = false
    @State private var startAuthInSignUp = false

    var body: some View {
        Group {
            if auth.isRecoveringPassword {
                NewPasswordView(auth: auth)
            } else if auth.isLoading || auth.isHandlingRecoveryLink {
                splash
            } else if auth.isSignedIn {
                ContentView(auth: auth)
            } else if hasOnboarded || wantsLogIn {
                AuthView(auth: auth, startInSignUp: startAuthInSignUp)
            } else {
                OnboardingFlowView(
                    onComplete: { habit, goal in
                        // Held on device only until there's an account to attach
                        // them to: the first authenticated refresh writes the
                        // habit to the profile and the goal to the participation.
                        let defaults = UserDefaults.standard
                        defaults.set(habit.dbValue, forKey: OnboardingStorage.habitKey)
                        defaults.set(goal.rawValue, forKey: OnboardingStorage.weeklyGoalKey)
                        startAuthInSignUp = true
                        hasOnboarded = true
                    },
                    onLogIn: { wantsLogIn = true }
                )
            }
        }
        .alert(
            "Reset link didn't work",
            isPresented: Binding(
                get: { auth.recoveryLinkError != nil },
                set: { if !$0 { auth.recoveryLinkError = nil } }
            )
        ) {
            Button("OK", role: .cancel) { auth.recoveryLinkError = nil }
        } message: {
            Text(auth.recoveryLinkError ?? "")
        }
    }

    private var splash: some View {
        VStack {
            ProgressView()
                .tint(Color.mintDeep)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
    }
}

struct ContentView: View {
    @Bindable var auth: AuthManager

    @State private var store = ChallengeStore()
    @State private var path: [AppRoute] = []

    var body: some View {
        Group {
            if store.needsGoal {
                // Signed in, but no commitment on record — ask before pricing.
                CommitmentView(store: store) {
                    Task { await auth.signOut() }
                }
            } else if store.needsDeposit {
                // An unpaid user cannot enter the challenge. The database enforces
                // this too, so this screen is the way in — not the only lock.
                DepositPaymentView(store: store) {
                    Task { await auth.signOut() }
                }
            } else {
                challengeStack
            }
        }
        .task(id: auth.userId) {
            await store.refresh()
        }
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if !signedIn { store.clear() }
        }
    }

    private var challengeStack: some View {
        NavigationStack(path: $path) {
            HomeView(store: store, path: $path, auth: auth)
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .verify:
                        VerificationView(store: store, path: $path)
                    case .success:
                        SuccessView(store: store, path: $path)
                    }
                }
        }
        .tint(Color.navy)
    }
}
