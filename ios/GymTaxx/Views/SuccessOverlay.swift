//
//  SuccessOverlay.swift
//  GymTaxx
//

import SwiftUI

/// Full-screen success page shown after a workout is verified.
/// Pushed onto the app's NavigationStack.
struct SuccessView: View {
    let store: ChallengeStore
    @Binding var path: [AppRoute]
    @State private var appeared = false

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            successCheck
                .scaleEffect(appeared ? 1 : 0.4)
                .opacity(appeared ? 1 : 0)
                .animation(.spring(response: 0.45, dampingFraction: 0.65), value: appeared)

            VStack(spacing: 8) {
                Text("Workout verified")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(Color.navy)
                Text(reclaimedText)
                    .font(.subheadline)
                    .foregroundStyle(Color.navy.opacity(0.6))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 12)
            .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.15), value: appeared)

            Spacer()

            Button {
                path = []
            } label: {
                Text("Back to Home")
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
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
        .navigationBarBackButtonHidden(true)
        .onAppear { appeared = true }
    }

    /// Progress against the user's own deposit, in the currency they paid in.
    private var reclaimedText: String {
        let currency = store.currency
        let earned = currency.amount(store.earnedSoFar)
        let deposit = currency.amount(store.challenge.depositAmount)
        return "Nice work. That's \(earned) of your \(deposit) reclaimed."
    }

    private var successCheck: some View {
        ZStack {
            Circle()
                .fill(Color.mintGreen)
                .frame(width: 110, height: 110)
            Image(systemName: "checkmark")
                .font(.system(size: 52, weight: .bold))
                .foregroundStyle(Color.navy)
        }
    }
}
