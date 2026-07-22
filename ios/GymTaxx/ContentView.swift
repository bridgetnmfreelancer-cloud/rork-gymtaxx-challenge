//
//  ContentView.swift
//  GymTaxx
//

import SwiftUI

/// Auth gate: shows the sign-in flow when logged out and the main app when
/// logged in. supabase-swift restores any persisted session on launch.
struct RootView: View {
    @Bindable var auth: AuthManager

    var body: some View {
        Group {
            if auth.isLoading {
                splash
            } else if auth.isSignedIn {
                ContentView(auth: auth)
            } else {
                AuthView(auth: auth)
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
