//
//  DepositView.swift
//  GymTaxx
//

import SwiftUI

/// Final onboarding screen: shows the deposit amount computed from the user's
/// weekly goal (goal x 4 weeks x 5). The card is taken after sign-up, once there
/// is an account to attach the payment to.
///
/// This runs before any participation record exists, so the currency comes from
/// the phone's region. It is the same value that gets written and locked when the
/// record is created moments later.
struct DepositView: View {
    let goal: WeeklyGoal
    let onContinue: () -> Void

    private let currency: Currency = .forCurrentRegion

    private var depositText: String { currency.amount(Double(goal.depositAmount)) }
    private var rewardText: String { currency.amount(5) }

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
                Text(depositText)
                    .font(.system(size: 64, weight: .heavy))
                    .foregroundStyle(Color.navy)
                    .contentTransition(.numericText())

                Text("\(goal.rawValue) workouts a week × 4 weeks × \(rewardText)")
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
                Text("Get back \(rewardText) for every workout you complete — that's \(goal.totalWorkouts) workouts to reclaim the full \(depositText).")
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
                    Text("Lock in \(depositText)")
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
