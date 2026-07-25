//
//  ContentView.swift
//  GymTaxx
//

import SwiftUI

/// Auth gate: first-time visitors see the onboarding flow, returning
/// logged-out users see the sign-in flow, and signed-in users see the app.
/// supabase-swift restores any persisted session on launch.
struct RootView: View {
    @Bindable var auth: AuthManager

    @AppStorage(OnboardingStorage.completedKey) private var hasOnboarded = false
    @State private var wantsLogIn = false
    @State private var startAuthInSignUp = false

    var body: some View {
        Group {
            if auth.isLoading {
                splash
            } else if auth.isSignedIn {
                ContentView(auth: auth)
            } else if hasOnboarded || wantsLogIn {
                AuthView(auth: auth, startInSignUp: startAuthInSignUp)
            } else {
                OnboardingFlowView(
                    onComplete: { goal in
                        UserDefaults.standard.set(goal.rawValue, forKey: OnboardingStorage.weeklyGoalKey)
                        startAuthInSignUp = true
                        hasOnboarded = true
                    },
                    onLogIn: { wantsLogIn = true }
                )
            }
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
        NavigationStack(path: $path) {
            HomeView(store: store, path: $path, auth: auth)
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .verify:
                        VerificationView(store: store, path: $path)
                    case .success:
                        SuccessView(path: $path)
                    }
                }
        }
        .tint(Color.navy)
        .task(id: auth.userId) {
            await store.refresh()
        }
        .onChange(of: auth.isSignedIn) { _, signedIn in
            if !signedIn { store.clear() }
        }
    }
}
