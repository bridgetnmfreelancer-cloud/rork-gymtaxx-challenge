//
//  VerificationView.swift
//  GymTaxx
//

import SwiftUI
import UIKit

/// The gym verification flow: capture a photo, then show "pending".
/// Pushed onto the app's NavigationStack from Home.
struct VerificationView: View {
    @Bindable var store: ChallengeStore
    @Binding var path: [AppRoute]

    @State private var capturedImage: UIImage?
    @State private var phase: VerificationPhase = .capture
    @State private var showCamera = false
    @State private var animating = false

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
                Image(systemName: "camera.viewfinder")
                    .font(.system(size: 64, weight: .semibold))
                    .foregroundStyle(Color.mintDeep)
                Text("Snap a photo at the gym")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(Color.navy)
                Text("Capture the date, time and your surroundings. We'll verify it's a real gym session.")
                    .font(.subheadline)
                    .foregroundStyle(Color.navy.opacity(0.55))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            Button {
                showCamera = true
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "camera.fill")
                    Text("Open Camera")
                }
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color.navy)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(Color.mintGreen)
                .clipShape(.rect(cornerRadius: 20))
            }
            .buttonStyle(.plain)
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

            VStack(spacing: 12) {
                Button {
                    path = []
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

                // MVP helper: simulate the manual verification step.
                Button {
                    store.verifyMostRecentPendingWorkout()
                    path = [.success]
                } label: {
                    Text("Simulate verified (MVP)")
                        .font(.footnote)
                        .foregroundStyle(Color.navy.opacity(0.45))
                        .padding(.vertical, 6)
                }
            }
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
        guard capturedImage != nil else { return }
        store.addPendingWorkout()
        withAnimation(.easeInOut(duration: 0.3)) {
            phase = .pending
        }
    }
}

private enum VerificationPhase {
    case capture
    case pending
}
