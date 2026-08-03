//
//  VerificationView.swift
//  GymTaxx
//

import SwiftUI
import UIKit
import AVFoundation
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

    @Environment(\.scenePhase) private var scenePhase

    /// Held for the life of the screen so the permission prompt and the fix
    /// share one manager.
    @State private var locationCapture = LocationCapture()

    var body: some View {
        VStack(spacing: 0) {
            switch phase {
            case .capture:
                capturePhase
            case .accessDenied:
                accessDeniedPhase
            case .locationDenied:
                locationDeniedPhase
            case .noCamera:
                CameraPlaceholderView()
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
        .onChange(of: showCamera) { _, isOpen in
            // Start looking for a position while the user frames their shot. That
            // overlap is what keeps location off the critical path at submit time.
            if isOpen { locationCapture.prewarm() }
        }
        .onAppear(perform: checkLocationAccess)
        .onChange(of: capturedImage) { _, newValue in
            if newValue != nil {
                submit()
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            // Coming back from Settings: if access was granted, return to the
            // capture screen rather than leaving a stale "blocked" message up.
            guard newPhase == .active else { return }
            switch phase {
            case .accessDenied where CameraPermission.status == .authorized,
                 .locationDenied where !locationCapture.isBlocked:
                withAnimation(.easeInOut(duration: 0.25)) { phase = .capture }
            default:
                break
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

                if !isSubmitting {
                    Label(
                        "Your location is saved with the photo to confirm you're at the gym. A weak signal indoors won't cost you the check-in.",
                        systemImage: "location.fill"
                    )
                    .fixedSize(horizontal: false, vertical: true)
                    .font(.footnote)
                    .foregroundStyle(Color.navy.opacity(0.45))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 36)
                    .padding(.top, 2)
                }

                if let submitError {
                    Text(submitError)
                        .font(.footnote)
                        .foregroundStyle(Color.appRed)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.top, 4)
                }
            }

            Spacer()

            Button {
                requestCamera()
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

    // MARK: - Access denied

    /// Shown when the camera is blocked. Without this the picker opens onto a
    /// black screen, dead-ending the only flow that earns the deposit back.
    private var accessDeniedPhase: some View {
        VStack(spacing: 28) {
            Spacer()

            VStack(spacing: 14) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 56, weight: .semibold))
                    .foregroundStyle(Color.navy.opacity(0.25))
                Text("Camera access needed")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(Color.navy)
                Text("GymTaxx verifies workouts from a photo you take at the gym, so we need the camera to pay your deposit back. You can turn it on in Settings.")
                    .font(.subheadline)
                    .foregroundStyle(Color.navy.opacity(0.55))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            VStack(spacing: 8) {
                Button(action: openSettings) {
                    Text("Open Settings")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Color.navy)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(Color.mintGreen)
                        .clipShape(.rect(cornerRadius: 20))
                }
                .buttonStyle(.plain)

                Button {
                    path = []
                } label: {
                    Text("Not now")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.navy.opacity(0.55))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
        }
    }

    // MARK: - Location blocked

    /// Shown when location has been refused. Previously this state was invisible:
    /// `LocationCapture` knew about it and nothing ever asked, so one accidental
    /// "Don't Allow" at the gym silently stripped the position off every later
    /// check-in without the user or us ever finding out.
    private var locationDeniedPhase: some View {
        VStack(spacing: 28) {
            Spacer()

            VStack(spacing: 14) {
                Image(systemName: "location.slash.fill")
                    .font(.system(size: 56, weight: .semibold))
                    .foregroundStyle(Color.navy.opacity(0.25))
                Text("Location access needed")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(Color.navy)
                Text("We save where you were with each photo to confirm a real gym visit. Without it we can't verify a check-in, so it can't earn your deposit back. Turn location on in Settings and come straight back.")
                    .font(.subheadline)
                    .foregroundStyle(Color.navy.opacity(0.55))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 32)
            }

            Spacer()

            VStack(spacing: 8) {
                Button(action: openSettings) {
                    Text("Open Settings")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Color.navy)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(Color.mintGreen)
                        .clipShape(.rect(cornerRadius: 20))
                }
                .buttonStyle(.plain)

                Button {
                    path = []
                } label: {
                    Text("Back to home")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(Color.navy.opacity(0.55))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
        }
    }

    /// Catches a refusal before the photo, not after — nobody should take a shot
    /// only to be told it couldn't be counted.
    private func checkLocationAccess() {
        guard phase == .capture, locationCapture.isBlocked else { return }
        withAnimation(.easeInOut(duration: 0.25)) { phase = .locationDenied }
    }

    /// Ask for the camera at the moment the user opts in, so the system prompt
    /// lands while the on-screen explanation is still visible.
    private func requestCamera() {
        guard !locationCapture.isBlocked else {
            withAnimation(.easeInOut(duration: 0.25)) { phase = .locationDenied }
            return
        }

        // No camera device: say so plainly. There is deliberately no photo
        // library fallback — a picked image would be worthless as proof.
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            withAnimation(.easeInOut(duration: 0.25)) { phase = .noCamera }
            return
        }

        switch CameraPermission.status {
        case .authorized:
            showCamera = true
        case .notDetermined:
            Task {
                if await CameraPermission.request() {
                    showCamera = true
                } else {
                    withAnimation(.easeInOut(duration: 0.25)) { phase = .accessDenied }
                }
            }
        default:
            withAnimation(.easeInOut(duration: 0.25)) { phase = .accessDenied }
        }
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
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
        guard let userId = supabaseUserId,
              let participationId = store.participationId else {
            submitError = "We couldn't confirm your challenge. Please go back and try again."
            capturedImage = nil
            return
        }

        submitError = nil
        isSubmitting = true
        let capturedAt = Date()

        Task {
            // Usually instant: the lookup started when the camera opened. A dead
            // spot still returns, tagged, so a check-in is never lost to it.
            let fix = await locationCapture.fix()
            do {
                try await WorkoutService.submitWorkout(
                    image: image,
                    userId: userId,
                    userChallengeId: participationId,
                    capturedAt: capturedAt,
                    fix: fix
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
    case accessDenied
    /// Location was refused outright. Blocking here is deliberate: a check-in with
    /// no position and no reason can't be reviewed honestly.
    case locationDenied
    case noCamera
    case pending
}
