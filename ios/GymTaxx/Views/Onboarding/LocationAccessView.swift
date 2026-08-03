//
//  LocationAccessView.swift
//  GymTaxx
//

import SwiftUI
import UIKit

/// Asks for location during onboarding rather than mid-check-in.
///
/// The old flow raised the system prompt while a photo was uploading at the gym —
/// noisy, rushed, and unexplained, which is exactly when people jab "Don't Allow".
/// That single tap was permanent and silent. Asking here, on a calm screen with the
/// reason on it, is the whole point of this step.
struct LocationAccessView: View {
    let onContinue: () -> Void

    @State private var isAsking = false
    @State private var wasBlocked = false
    @State private var locationCapture = LocationCapture()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            ZStack {
                Circle()
                    .fill(Color.mintGreen.opacity(0.25))
                    .frame(width: 132, height: 132)
                Circle()
                    .fill(Color.mintGreen)
                    .frame(width: 96, height: 96)
                Image(systemName: "location.fill")
                    .font(.system(size: 40, weight: .semibold))
                    .foregroundStyle(Color.navy)
            }
            .padding(.bottom, 36)

            Text("Prove you were there.")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(Color.navy)
                .multilineTextAlignment(.center)
                .padding(.bottom, 14)

            Text("Every check-in saves where you were, alongside your photo. It's how we confirm a real gym visit and pay your money back without you having to argue for it.")
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Color.navy.opacity(0.55))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 8)

            reassurance
                .padding(.top, 26)

            if wasBlocked {
                blockedNote
                    .padding(.top, 20)
            }

            Spacer()

            Button(action: ask) {
                HStack(spacing: 10) {
                    if isAsking {
                        ProgressView().tint(Color.navy)
                    }
                    Text(wasBlocked ? "Open Settings" : "Allow location")
                }
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color.navy)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(Color.mintGreen)
                .clipShape(.rect(cornerRadius: 20))
                .opacity(isAsking ? 0.6 : 1)
            }
            .buttonStyle(.plain)
            .disabled(isAsking)
            .padding(.bottom, 16)
        }
        .padding(.horizontal, 24)
        .onChange(of: scenePhase) { _, newPhase in
            // Back from Settings: move on the moment access exists, so nobody has to
            // work out that they should press Continue again.
            guard newPhase == .active, wasBlocked,
                  locationCapture.permission == .granted else { return }
            onContinue()
        }
    }

    /// Says out loud what we don't do. Location is the permission people are most
    /// suspicious of, and "only when you check in" is the honest, reassuring part.
    private var reassurance: some View {
        VStack(alignment: .leading, spacing: 12) {
            reassuranceRow("Only read when you check in", icon: "hand.raised.fill")
            reassuranceRow("Never tracked in the background", icon: "moon.zzz.fill")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Color.appCard)
        .clipShape(.rect(cornerRadius: 18))
    }

    private func reassuranceRow(_ text: String, icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.mintDeep)
                .frame(width: 22)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Color.navy.opacity(0.7))
            Spacer(minLength: 0)
        }
    }

    private var blockedNote: some View {
        Text("Location is currently switched off for GymTaxx. Turn it on in Settings so your check-ins count.")
            .font(.footnote)
            .foregroundStyle(Color.appRed)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 8)
    }

    private func ask() {
        if wasBlocked {
            openSettings()
            return
        }

        isAsking = true
        Task {
            let result = await locationCapture.requestPermission()
            isAsking = false
            switch result {
            case .granted, .notAsked:
                // `.notAsked` means the prompt never resolved. Not worth trapping
                // someone on this screen for — the check-in screen asks again.
                onContinue()
            case .blocked:
                withAnimation(.easeInOut(duration: 0.25)) { wasBlocked = true }
            }
        }
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
