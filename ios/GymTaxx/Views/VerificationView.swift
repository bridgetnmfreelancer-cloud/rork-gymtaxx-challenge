//
//  VerificationView.swift
//  GymTaxx
//

import SwiftUI
import UIKit
import Supabase

/// The gym verification flow: capture a photo, then show "pending".
/// Pushed onto the app's NavigationStack from Home.
struct VerificationView: View {
    @Bindable var store: ChallengeStore
    @Binding var path: [AppRoute]

    @State private var capturedImage: UIImage?
    @State private var phase: VerificationPhase = .capture
    @State private var showCamera = false
    @State private var animating = false
    @State private var isSubmitting = false
    @State private var submitError: String?

    var body: some View {
        VStack(spacing: 0) {
            switch phase {
            case .capture:
                capturePhase
            case .pending:
                pendingPhase
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .navigationTitle("Verify Workout")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(phase == .pending)
        .sheet(isPresented: $showCamera) {
            CameraView(capturedImage: $capturedImage)
                .ignoresSafeArea()
        }
        .onChange(of: capturedImage) { _, newValue in
            if newValue != nil {
                submit()
            }
        }
    }

    // MARK: - Capture

    private var capturePhase: some View {
        VStack(spacing: 28) {
            Spacer()

            VStack(spacing: 14) {
                Image(systemName: isSubmitting ? "arrow.up.circle" : "camera.viewfinder")
                    .font(.system(size: 64, weight: .semibold))
                    .foregroundStyle(Color.mintDeep)
                Text(isSubmitting ? "Uploading your proof…" : "Snap a photo at the gym")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(Color.navy)
                Text("Capture the date, time and your surroundings. We'll verify it's a real gym session.")
                    .font(.subheadline)
                    .foregroundStyle(Color.navy.opacity(0.55))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                if let submitError {
                    ScrollView {
                        Text(submitError)
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(Color.appRed)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                            .padding(12)
                    }
                    .frame(maxHeight: 220)
                    .background(Color.appCard)
                    .clipShape(.rect(cornerRadius: 12))
                    .padding(.horizontal, 20)
                    .padding(.top, 4)
                }
            }

            Spacer()

            Button {
                showCamera = true
            } label: {
                HStack(spacing: 10) {
                    if isSubmitting {
                        ProgressView().tint(Color.navy)
                    } else {
                        Image(systemName: "camera.fill")
                        Text(submitError == nil ? "Open Camera" : "Try Again")
                    }
                }
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color.navy)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(Color.mintGreen)
                .clipShape(.rect(cornerRadius: 20))
                .opacity(isSubmitting ? 0.6 : 1)
            }
            .buttonStyle(.plain)
            .disabled(isSubmitting)
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
        }
    }

    // MARK: - Pending

    private var pendingPhase: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 18) {
                pendingRing
                VStack(spacing: 6) {
                    Text("Verification pending")
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(Color.navy)
                    Text("We're reviewing your workout photo. You'll see it verified on your home screen shortly.")
                        .font(.subheadline)
                        .foregroundStyle(Color.navy.opacity(0.55))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
            }

            Spacer()

            Button {
                Task {
                    await store.refresh()
                    path = []
                }
            } label: {
                Text("Back to Home")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Color.navy)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Color.appCard)
                    .clipShape(.rect(cornerRadius: 18))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
        }
    }

    private var pendingRing: some View {
        ZStack {
            Circle()
                .stroke(Color.appCard, lineWidth: 8)
                .frame(width: 120, height: 120)
            Circle()
                .trim(from: 0, to: 0.25)
                .stroke(Color.mintDeep, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .frame(width: 120, height: 120)
                .rotationEffect(.degrees(animating ? 360 : 0))
                .animation(.linear(duration: 1.2).repeatForever(autoreverses: false), value: animating)
            Image(systemName: "clock.fill")
                .font(.system(size: 40))
                .foregroundStyle(Color.mintDeep)
        }
        .onAppear { animating = true }
    }

    // MARK: - Submit

    private func submit() {
        guard let image = capturedImage else { return }
        guard let userId = supabaseUserId, let challengeId = store.challengeId else {
            submitError = "We couldn't confirm your challenge. Please go back and try again."
            capturedImage = nil
            return
        }

        submitError = nil
        isSubmitting = true
        let capturedAt = Date()

        Task {
            do {
                try await WorkoutService.submitWorkout(
                    image: image,
                    userId: userId,
                    challengeId: challengeId,
                    capturedAt: capturedAt
                )
                isSubmitting = false
                withAnimation(.easeInOut(duration: 0.3)) {
                    phase = .pending
                }
            } catch {
                isSubmitting = false
                submitError = (error as? LocalizedError)?.errorDescription
                    ?? "Something went wrong. Please try again."
            }
            capturedImage = nil
        }
    }

    private var supabaseUserId: String? {
        supabase.auth.currentUser?.id.uuidString
    }
}

private enum VerificationPhase {
    case capture
    case pending
}
