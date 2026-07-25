//
//  OnboardingQuestionView.swift
//  GymTaxx
//

import SwiftUI

/// A single onboarding question option.
struct OnboardingOption: Identifiable {
    let id: String
    let label: String
}

/// Generic onboarding question screen: big title + tappable answer list.
struct OnboardingQuestionView: View {
    let title: String
    let options: [OnboardingOption]
    let selectedId: String?
    let onSelect: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(Color.navy)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 28)
                .padding(.bottom, 32)

            VStack(spacing: 12) {
                ForEach(options) { option in
                    OnboardingOptionButton(
                        label: option.label,
                        isSelected: option.id == selectedId
                    ) {
                        onSelect(option.id)
                    }
                }
            }

            Spacer()
        }
        .padding(.horizontal, 24)
    }
}
