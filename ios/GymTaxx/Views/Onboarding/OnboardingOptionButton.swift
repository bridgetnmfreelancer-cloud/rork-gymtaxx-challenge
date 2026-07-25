//
//  OnboardingOptionButton.swift
//  GymTaxx
//

import SwiftUI

/// A selectable answer row used by onboarding questions.
struct OnboardingOptionButton: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Text(label)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.navy)
                    .multilineTextAlignment(.leading)

                Spacer()

                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(isSelected ? Color.mintDeep : Color.navy.opacity(0.15))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 18)
            .background(Color.appCard)
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(isSelected ? Color.mintDeep : Color.clear, lineWidth: 2)
            )
            .clipShape(.rect(cornerRadius: 18))
        }
        .buttonStyle(.plain)
        .sensoryFeedback(.selection, trigger: isSelected)
        .animation(.easeOut(duration: 0.15), value: isSelected)
    }
}
