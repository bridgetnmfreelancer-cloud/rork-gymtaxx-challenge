//
//  CommitmentView.swift
//  GymTaxx
//

import SwiftUI

/// Asks a signed-in user for their weekly goal when their account has no
/// commitment yet — a new device, a reinstall, or a sign-up that skipped the
/// pre-account onboarding. Without this the account would have nothing to price
/// a deposit from.
struct CommitmentView: View {
    let store: ChallengeStore
    let onSignOut: () -> Void

    @State private var selected: WeeklyGoal?
    @State private var isSaving = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            OnboardingQuestionView(
                title: "How many workouts a week are you committing to?",
                options: WeeklyGoal.allCases.map {
                    OnboardingOption(id: String($0.rawValue), label: $0.label)
                },
                selectedId: selected.map { String($0.rawValue) },
                onSelect: { id in
                    guard let raw = Int(id), let goal = WeeklyGoal(rawValue: raw) else { return }
                    selected = goal
                }
            )

            footer
                .padding(.horizontal, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.white)
    }

    private var footer: some View {
        VStack(spacing: 14) {
            if let selected {
                Text("Your deposit will be \(deposit(for: selected)) — \(selected.totalWorkouts) workouts to earn it all back.")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.navy.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            }

            if let error = store.loadError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(Color.appRed)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                guard let selected else { return }
                isSaving = true
                Task {
                    await store.commit(goal: selected)
                    isSaving = false
                }
            } label: {
                HStack(spacing: 10) {
                    if isSaving { ProgressView().tint(Color.navy) }
                    Text(isSaving ? "Saving…" : "Continue")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Color.navy)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(selected == nil ? Color.appCard : Color.mintGreen)
                .clipShape(.rect(cornerRadius: 20))
            }
            .buttonStyle(.plain)
            .disabled(selected == nil || isSaving)
            .sensoryFeedback(.success, trigger: isSaving)

            Button(action: onSignOut) {
                Text("Sign out")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.navy.opacity(0.45))
            }
            .buttonStyle(.plain)
        }
        .padding(.bottom, 16)
        .animation(.spring(response: 0.35, dampingFraction: 0.9), value: selected)
    }

    /// This screen runs before a participation record exists, so the phone's
    /// region decides — the same value that gets locked onto the record when the
    /// goal is saved a moment later.
    private func deposit(for goal: WeeklyGoal) -> String {
        Currency.forCurrentRegion.format(goal.depositAmount)
    }
}
