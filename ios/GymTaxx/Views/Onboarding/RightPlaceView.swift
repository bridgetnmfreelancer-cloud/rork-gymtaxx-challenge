//
//  RightPlaceView.swift
//  GymTaxx
//

import SwiftUI

/// Onboarding affirmation screen shown after the two questions.
struct RightPlaceView: View {
    let onContinue: () -> Void

    @State private var hasAppeared = false

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
                Image(systemName: "checkmark")
                    .font(.system(size: 44, weight: .heavy))
                    .foregroundStyle(Color.navy)
            }
            .scaleEffect(hasAppeared ? 1 : 0.5)
            .opacity(hasAppeared ? 1 : 0)
            .padding(.bottom, 36)

            Text("You are in the right place.")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(Color.navy)
                .multilineTextAlignment(.center)
                .padding(.bottom, 14)

            Text("GymTaxx helps you stay consistent with or without motivation.")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Color.navy.opacity(0.55))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)

            Spacer()

            Button(action: onContinue) {
                Text("Continue")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Color.navy)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                    .background(Color.mintGreen)
                    .clipShape(.rect(cornerRadius: 20))
            }
            .buttonStyle(.plain)
            .padding(.bottom, 16)
        }
        .padding(.horizontal, 24)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.65)) {
                hasAppeared = true
            }
        }
        .sensoryFeedback(.success, trigger: hasAppeared)
    }
}
