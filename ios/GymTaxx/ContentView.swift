//
//  ContentView.swift
//  GymTaxx
//

import SwiftUI

struct ContentView: View {
    @State private var store = ChallengeStore()
    @State private var path: [AppRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            HomeView(store: store, path: $path)
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
    }
}

#Preview {
    ContentView()
}
