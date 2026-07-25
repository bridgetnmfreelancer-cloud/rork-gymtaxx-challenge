//
//  PasswordResetView.swift
//  GymTaxx
//

import SwiftUI

/// Requests a password recovery email.
///
/// This screen's job ends when the email is sent. Tapping the link in that email
/// opens GymTaxx through the `gymtaxx://` scheme, and `RootView` takes over by
/// showing `NewPasswordView` — so there is nothing to copy, paste, or type back.
struct PasswordResetView: View {
    let auth: AuthManager
    /// Pre-filled from the login form so the user doesn't retype it.
    let initialEmail: String
    let onDismiss: () -> Void

    private enum Step {
        case request
        case sent
    }

    @State private var step: Step = .request
    @State private var email: String
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    init(auth: AuthManager, initialEmail: String, onDismiss: @escaping () -> Void) {
        self.auth = auth
        self.initialEmail = initialEmail
        self.onDismiss = onDismiss
        _email = State(initialValue: initialEmail)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                switch step {
                case .request: requestStep
                case .sent: sentStep
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.white)
        .overlay(alignment: .topTrailing) { closeButton }
    }

    // MARK: - Chrome

    private var closeButton: some View {
        Button(action: onDismiss) {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.navy.opacity(0.5))
                .padding(12)
                .background(Color.appCard, in: .circle)
        }
        .buttonStyle(.plain)
        .padding(.top, 12)
        .padding(.trailing, 20)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(step == .request ? "Reset your password" : "Check your email")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(Color.navy)
                .fixedSize(horizontal: false, vertical: true)

            Text(subtitle)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color.navy.opacity(0.55))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 56)
        .padding(.bottom, 28)
    }

    private var subtitle: String {
        switch step {
        case .request:
            return "We'll email you a reset link. Your deposit and progress stay exactly as they are."
        case .sent:
            return "We sent a link to \(email). Tap it and GymTaxx will open right on the new-password screen."
        }
    }

    // MARK: - Steps

    private var requestStep: some View {
        VStack(spacing: 14) {
            field {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            errorLabel

            primaryButton(
                title: "Send reset link",
                busyTitle: "Sending…",
                isEnabled: email.contains("@")
            ) {
                await sendEmail()
            }
        }
    }

    private var sentStep: some View {
        VStack(spacing: 18) {
            Image(systemName: "envelope.badge.fill")
                .font(.system(size: 48, weight: .semibold))
                .foregroundStyle(Color.mintDeep)
                .padding(.vertical, 4)

            hint

            errorLabel

            Button {
                Task {
                    isSubmitting = true
                    await sendEmail()
                    isSubmitting = false
                }
            } label: {
                Text(isSubmitting ? "Sending…" : "Send another email")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.mintDeep)
            }
            .buttonStyle(.plain)
            .disabled(isSubmitting)
        }
        .frame(maxWidth: .infinity)
    }

    private var hint: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "iphone.badge.play")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.mintDeep)
            Text("Open the link on this phone — that's where the reset was started, and links only work once. If nothing arrives, check your spam folder.")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.navy.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.mintGreen.opacity(0.15))
        .clipShape(.rect(cornerRadius: 14))
    }

    @ViewBuilder
    private var errorLabel: some View {
        if let errorMessage {
            Text(errorMessage)
                .font(.footnote)
                .foregroundStyle(Color.appRed)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .transition(.opacity)
        }
    }

    // MARK: - Building blocks

    private func field<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .font(.system(size: 17))
            .foregroundStyle(Color.navy)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(Color.appCard)
            .clipShape(.rect(cornerRadius: 16))
    }

    private func primaryButton(
        title: String,
        busyTitle: String,
        isEnabled: Bool,
        action: @escaping () async -> Void
    ) -> some View {
        Button {
            Task {
                isSubmitting = true
                await action()
                isSubmitting = false
            }
        } label: {
            HStack(spacing: 10) {
                if isSubmitting { ProgressView().tint(Color.navy) }
                Text(isSubmitting ? busyTitle : title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Color.navy)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(Color.mintGreen)
            .clipShape(.rect(cornerRadius: 20))
            .opacity(isEnabled && !isSubmitting ? 1 : 0.5)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || isSubmitting)
    }

    // MARK: - Actions

    private func sendEmail() async {
        errorMessage = nil
        do {
            try await auth.sendPasswordReset(email: email)
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                step = .sent
            }
        } catch {
            errorMessage = friendlyRequestError(error)
        }
    }

    private func friendlyRequestError(_ error: Error) -> String {
        let text = error.localizedDescription.lowercased()
        if text.contains("rate") || text.contains("too many") || text.contains("seconds") {
            return "Too many attempts. Wait a minute, then try again."
        }
        return "We couldn't send that email. Check the address and try again."
    }
}
