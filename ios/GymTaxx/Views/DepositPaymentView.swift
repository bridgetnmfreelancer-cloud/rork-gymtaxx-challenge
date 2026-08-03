//
//  DepositPaymentView.swift
//  GymTaxx
//

import SwiftUI
import UIKit
import StripePaymentSheet

/// The gate between signing up and taking part: the user pays their deposit here.
///
/// Nothing about the amount is decided on the device — the server prices the
/// deposit from the goal the user committed to and returns a Stripe client secret.
/// After paying, the app waits for Stripe's webhook to mark the record paid.
struct DepositPaymentView: View {
    let store: ChallengeStore
    let onSignOut: () -> Void

    @State private var paymentSheet: PaymentSheet?
    @State private var amount: Double?
    @State private var isPreparing = true
    @State private var isConfirming = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            depositCard
                .padding(.bottom, 16)

            reassurance

            Spacer(minLength: 24)

            footer
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.white)
        .task { await prepare() }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Secure your place")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(Color.navy)

            Text("Your deposit is fully refundable. Earn every penny back by showing up.")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color.navy.opacity(0.55))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 32)
        .padding(.bottom, 28)
    }

    private var depositCard: some View {
        VStack(spacing: 16) {
            if let amount {
                Text(formatted(amount))
                    .font(.system(size: 64, weight: .heavy))
                    .foregroundStyle(Color.navy)
                    .contentTransition(.numericText())
            } else {
                Text("—")
                    .font(.system(size: 64, weight: .heavy))
                    .foregroundStyle(Color.navy.opacity(0.25))
            }

            Text(breakdown)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.navy.opacity(0.55))
                .multilineTextAlignment(.center)

            startLine
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .background(Color.appCard)
        .clipShape(.rect(cornerRadius: 24))
        .animation(.spring(response: 0.4, dampingFraction: 0.9), value: amount)
    }

    private var reassurance: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(Color.mintDeep)
            Text("Paid securely through Stripe. GymTaxx never sees your card details.")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(Color.navy.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.mintGreen.opacity(0.15))
        .clipShape(.rect(cornerRadius: 16))
    }

    @ViewBuilder
    private var footer: some View {
        VStack(spacing: 12) {
            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Color.appRed)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if isConfirming {
                statusButton(title: "Confirming your payment…")
            } else if let paymentSheet {
                PaymentSheet.PaymentButton(
                    paymentSheet: paymentSheet,
                    onCompletion: handleResult
                ) {
                    payLabel
                }
            } else if isPreparing {
                statusButton(title: "Preparing…")
            } else {
                Button {
                    Task { await prepare() }
                } label: {
                    Text("Try again")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Color.navy)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 18)
                        .background(Color.mintGreen)
                        .clipShape(.rect(cornerRadius: 20))
                }
                .buttonStyle(.plain)
            }

            Button(action: onSignOut) {
                Text("Sign out")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.navy.opacity(0.45))
            }
            .buttonStyle(.plain)
        }
        .padding(.bottom, 16)
    }

    private var payLabel: some View {
        Text(amount.map { "Pay \(formatted($0))" } ?? "Pay deposit")
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(Color.navy)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(Color.mintGreen)
            .clipShape(.rect(cornerRadius: 20))
    }

    private func statusButton(title: String) -> some View {
        HStack(spacing: 10) {
            ProgressView().tint(Color.navy)
            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Color.navy)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .background(Color.appCard)
        .clipShape(.rect(cornerRadius: 20))
    }

    // MARK: - Copy

    /// States the start date before the user pays.
    ///
    /// Sign-ups peak late at night, when people are at their most impulsive, so
    /// this is the last moment to make the commitment concrete. Someone paying
    /// before a holiday would otherwise burn weeks of their challenge away from a
    /// gym and lose most of their deposit - a fair refund request, avoided with
    /// one line.
    private var startLine: some View {
        HStack(spacing: 7) {
            Image(systemName: "calendar")
                .font(.system(size: 13, weight: .semibold))
            Text(startText)
                .font(.system(size: 14, weight: .bold))
        }
        .foregroundStyle(Color.mintDeep)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color.mintGreen.opacity(0.22))
        .clipShape(.capsule)
        .padding(.top, 4)
    }

    /// Computed from now rather than from the stored date: the server re-anchors
    /// the start when the payment lands, so this is what the user actually gets.
    /// Measured on the clock stored against their challenge, so a Sunday-night
    /// joiner in Los Angeles sees the Monday that's still ahead of them.
    private var startText: String {
        let week = store.week
        let start = week.weeklyStart(onOrAfter: Date())
        let date = start.formatted(.dateTime.weekday(.wide).day().month(.wide))
        return week.calendar.isDateInToday(start) ? "Starts today" : "Starts \(date)"
    }

    private var breakdown: String {
        let goal = store.challenge.workoutsPerWeek
        let weeks = store.challenge.numberOfWeeks
        let reward = store.challenge.rewardPerWorkout
        return "\(goal) workouts a week × \(weeks) weeks × \(formatted(reward))"
    }

    /// Follows the participation record, so the figure on the pay button always
    /// matches the currency the charge is actually created in server-side.
    private func formatted(_ value: Double) -> String {
        store.currency.format(value)
    }

    // MARK: - Payment

    private func prepare() async {
        isPreparing = true
        errorMessage = nil
        do {
            let session = try await PaymentService.startDepositPayment()

            if session.isPaid {
                // Already settled (e.g. the webhook landed while we were away).
                await store.refresh()
                isPreparing = false
                return
            }

            guard let clientSecret = session.clientSecret,
                  let publishableKey = session.publishableKey else {
                throw PaymentServiceError.missingClientSecret
            }

            amount = session.amount
            STPAPIClient.shared.publishableKey = publishableKey

            var configuration = PaymentSheet.Configuration()
            configuration.merchantDisplayName = "GymTaxx"
            configuration.primaryButtonColor = UIColor(Color.mintGreen)
            paymentSheet = PaymentSheet(
                paymentIntentClientSecret: clientSecret,
                configuration: configuration
            )
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "We couldn't start the payment. Please try again."
        }
        isPreparing = false
    }

    private func handleResult(_ result: PaymentSheetResult) {
        switch result {
        case .completed:
            isConfirming = true
            Task {
                let confirmed = await store.awaitDepositConfirmation()
                isConfirming = false
                if !confirmed {
                    errorMessage = "Payment received — we're still confirming it. Give it a moment and tap Try again."
                    paymentSheet = nil
                }
            }
        case .canceled:
            break
        case .failed(let error):
            #if DEBUG
            NSLog("%@", "GymTaxx deposit: payment failed: \(String(reflecting: error))")
            #endif
            errorMessage = "That payment didn't go through. Please try again."
        }
    }
}
