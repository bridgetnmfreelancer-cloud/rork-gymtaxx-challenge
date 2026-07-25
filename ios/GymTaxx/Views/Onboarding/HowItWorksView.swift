//
//  HowItWorksView.swift
//  GymTaxx
//

import SwiftUI

/// Onboarding pitch screen explaining the deposit mechanic, with the
/// "Sign up to the next challenge" call to action.
struct HowItWorksView: View {
    let onSignUp: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("You're this close to becoming the person that shows up for themselves without fail.")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundStyle(Color.navy)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 28)
                        .padding(.bottom, 28)

                    Text("HOW IT WORKS")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Color.navy.opacity(0.45))
                        .tracking(1.2)
                        .padding(.bottom, 14)

                    VStack(spacing: 10) {
                        howItWorksRow(icon: "lock.fill", tint: Color.mintDeep, text: "You lock in a fully refundable deposit.")
                        howItWorksRow(icon: "building.columns.fill", tint: Color.mintDeep, text: "We keep it for you.")
                        howItWorksRow(icon: "flame.fill", tint: Color.mintDeep, text: "You smash your goal.")
                        howItWorksRow(icon: "sterlingsign.circle.fill", tint: Color.mintDeep, text: "You get back £5 every time you go to the gym.")
                        howItWorksRow(icon: "xmark.circle.fill", tint: Color.appRed, text: "If you skip a workout, we keep the £5.")
                    }
                }
            }

            Button(action: onSignUp) {
                Text("Sign up to the next challenge")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Color.navy)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                    .background(Color.mintGreen)
                    .clipShape(.rect(cornerRadius: 20))
            }
            .buttonStyle(.plain)
            .padding(.top, 12)
            .padding(.bottom, 16)
        }
        .padding(.horizontal, 24)
    }

    private func howItWorksRow(icon: String, tint: Color, text: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 40, height: 40)
                .background(tint.opacity(0.12))
                .clipShape(Circle())

            Text(text)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.navy)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.appCard)
        .clipShape(.rect(cornerRadius: 16))
    }
}
