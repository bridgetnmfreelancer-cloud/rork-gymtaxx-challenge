//
//  OnboardingFlowView.swift
//  GymTaxx
//

import SwiftUI

/// The onboarding steps shown before account creation.
enum OnboardingStep: Int, CaseIterable {
    case habit
    case goal
    case rightPlace
    case howItWorks
    /// Deliberately after `howItWorks`: asking for location only makes sense once
    /// someone knows a check-in is a photo taken at the gym.
    case locationAccess
    case deposit
}

/// Container driving the pre-signup onboarding flow:
/// habit question → goal question → affirmation → how it works → location → deposit.
struct OnboardingFlowView: View {
    /// Called with both onboarding answers when the user finishes the flow: the
    /// habit belongs on their profile, the goal on their challenge participation.
    let onComplete: (GymHabit, WeeklyGoal) -> Void
    /// Called when an existing user taps "Log in" to skip onboarding.
    let onLogIn: () -> Void

    @State private var step: OnboardingStep = .habit
    @State private var habit: GymHabit?
    @State private var goal: WeeklyGoal?

    var body: some View {
        VStack(spacing: 0) {
            header
                .padding(.horizontal, 20)
                .padding(.top, 12)

            progressBar
                .padding(.horizontal, 24)
                .padding(.top, 14)

            ZStack {
                stepContent
                    .id(step)
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)
                    ))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .sensoryFeedback(.impact(weight: .light), trigger: step)
    }

    @ViewBuilder
    private var stepContent: some View {
        switch step {
        case .habit:
            OnboardingQuestionView(
                title: "How many times do you go to the gym?",
                options: GymHabit.allCases.map { OnboardingOption(id: $0.rawValue, label: $0.label) },
                selectedId: habit?.rawValue
            ) { id in
                habit = GymHabit(rawValue: id)
                advanceSoon(from: .habit)
            }
        case .goal:
            OnboardingQuestionView(
                title: "How many times a week do you want to go to the gym?",
                options: WeeklyGoal.allCases.map { OnboardingOption(id: String($0.rawValue), label: $0.label) },
                selectedId: goal.map { String($0.rawValue) }
            ) { id in
                goal = Int(id).flatMap(WeeklyGoal.init(rawValue:))
                advanceSoon(from: .goal)
            }
        case .rightPlace:
            RightPlaceView { advance() }
        case .howItWorks:
            HowItWorksView { advance() }
        case .locationAccess:
            LocationAccessView { advance() }
        case .deposit:
            DepositView(goal: goal ?? .three) {
                onComplete(habit ?? .inconsistent, goal ?? .three)
            }
        }
    }

    private var header: some View {
        HStack {
            if step != .habit {
                Button(action: goBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Color.navy)
                        .frame(width: 38, height: 38)
                        .background(Color.appCard)
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
            }

            Spacer()

            if step == .habit {
                Button(action: onLogIn) {
                    HStack(spacing: 4) {
                        Text("Already a member?")
                            .foregroundStyle(Color.navy.opacity(0.55))
                        Text("Log in")
                            .foregroundStyle(Color.mintDeep)
                            .fontWeight(.semibold)
                    }
                    .font(.subheadline)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(height: 38)
    }

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.appCard)
                Capsule()
                    .fill(Color.mintDeep)
                    .frame(width: geo.size.width * progressFraction)
            }
        }
        .frame(height: 6)
        .animation(.spring(response: 0.4, dampingFraction: 0.9), value: step)
    }

    private var progressFraction: CGFloat {
        CGFloat(step.rawValue + 1) / CGFloat(OnboardingStep.allCases.count)
    }

    /// Advance after a short beat so the selection state is visible first.
    private func advanceSoon(from current: OnboardingStep) {
        Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard step == current else { return }
            advance()
        }
    }

    private func advance() {
        guard let next = OnboardingStep(rawValue: step.rawValue + 1) else { return }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            step = next
        }
    }

    private func goBack() {
        guard let previous = OnboardingStep(rawValue: step.rawValue - 1) else { return }
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            step = previous
        }
    }
}
