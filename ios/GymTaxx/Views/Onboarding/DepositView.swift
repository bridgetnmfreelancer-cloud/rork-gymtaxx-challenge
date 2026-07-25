//
//  DepositView.swift
//  GymTaxx
//

import SwiftUI

/// Final onboarding screen: shows the deposit amount computed from the user's
/// weekly goal (goal x 4 weeks x GBP 5). The card is taken after sign-up, once
/// there is an account to attach the payment to.
struct DepositView: View {
    let goal: WeeklyGoal
    let onContinue: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Lock in your deposit")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(Color.navy)
                .padding(.top, 28)
                .padding(.bottom, 6)

            Text("Fully refundable. Earn it all back by showing up.")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color.navy.opacity(0.55))
                .padding(.bottom, 28)

            VStack(spacing: 16) {
                Text("£\(goal.depositAmount)")
                    .font(.system(size: 64, weight: .heavy))
                    .foregroundStyle(Color.navy)
                    .contentTransition(.numericText())

                Text("\(goal.rawValue) workouts a week × 4 weeks × £5")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.navy.opacity(0.55))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
            .background(Color.appCard)
            .clipShape(.rect(cornerRadius: 24))
            .padding(.bottom, 16)

            HStack(spacing: 12) {
                Image(systemName: "arrow.uturn.backward.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Color.mintDeep)
                Text("Get back £5 for every workout you complete — that's \(goal.totalWorkouts) workouts to reclaim the full £\(goal.depositAmount).")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Color.navy.opacity(0.7))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.mintGreen.opacity(0.15))
            .clipShape(.rect(cornerRadius: 16))

            Spacer()

            VStack(spacing: 10) {
                Button(action: onContinue) {
                    Text("Lock in £\(goal.depositAmount)")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Color.navy)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(Color.mintGreen)
                        .clipShape(.rect(cornerRadius: 20))
                }
                .buttonStyle(.plain)

                Text("Create your account next, then pay securely with Stripe.")
                    .font(.footnote)
                    .foregroundStyle(Color.navy.opacity(0.45))
            }
            .padding(.bottom, 16)
        }
        .padding(.horizontal, 24)
    }
}
