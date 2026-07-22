//
//  GymTaxxApp.swift
//  GymTaxx
//
//  Created by Rork on July 6, 2026.
//

import SwiftUI

@main
struct GymTaxxApp: App {
    @State private var auth = AuthManager()

    var body: some Scene {
        WindowGroup {
            RootView(auth: auth)
        }
    }
}
