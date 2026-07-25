//
//  PasswordResetView.swift
//  GymTaxx
//

import SwiftUI

/// Two-step password recovery: request the email, then bring the token back.
///
/// GymTaxx has no registered URL scheme, so the recovery email can't hand the
/// token straight to the app. Instead the user copies the reset link out of the
/// email and pastes it here — the token is extracted from it. A pasted link and a
/// typed code are both accepted, so this keeps working if the email template ever
/// starts including a short code.
struct PasswordResetView: View {
    let auth: AuthManager
    /// Pre-filled from the login form so the user doesn't retype it.
    let initialEmail: String
    let onDismiss: () -> Void

    private enum Step {
        case request
        case confirm
        case done
    }

    @State private var step: Step = .request
    @State private var email: String
    @State private var pastedLink = ""
    @State private var newPassword = ""
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
                case .confirm: confirmStep
                case .done: doneStep
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
            Text(title)
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

    private var title: String {
        switch step {
        case .request: return "Reset your password"
        case .confirm: return "Check your email"
        case .done: return "Password updated"
        }
    }

    private var subtitle: String {
        switch step {
        case .request:
            return "We'll email you a reset link. Your deposit and progress stay exactly as they are."
        case .confirm:
            return "Open the email from Supabase, copy the reset link, and paste it below with your new password."
        case .done:
            return "You're all set. Log in with your new password to get back to your challenge."
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

    private var confirmStep: some View {
        VStack(spacing: 14) {
            hint

            field {
                TextField("Paste the reset link", text: $pastedLink, axis: .vertical)
                    .lineLimit(1...4)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }

            field {
                SecureField("New password", text: $newPassword)
                    .textContentType(.newPassword)
            }

            errorLabel

            primaryButton(
                title: "Save new password",
                busyTitle: "Saving…",
                isEnabled: canSubmitNewPassword
            ) {
                await saveNewPassword()
            }

            Button {
                Task { await sendEmail(resend: true) }
            } label: {
                Text("Send another email")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.mintDeep)
            }
            .buttonStyle(.plain)
            .disabled(isSubmitting)
        }
    }

    private var doneStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56, weight: .bold))
                .foregroundStyle(Color.mintDeep)
                .padding(.top, 12)

            Button(action: onDismiss) {
                Text("Back to log in")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(Color.navy)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                    .background(Color.mintGreen)
                    .clipShape(.rect(cornerRadius: 20))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
    }

    private var hint: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.mintDeep)
            Text("Press and hold the link in the email, then choose Copy. Tapping it opens a blank web page instead.")
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

    private var canSubmitNewPassword: Bool {
        AuthManager.recoveryToken(from: pastedLink) != nil && newPassword.count >= 6
    }

    // MARK: - Actions

    private func sendEmail(resend: Bool = false) async {
        errorMessage = nil
        do {
            try await auth.sendPasswordReset(email: email)
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                step = .confirm
            }
        } catch {
            errorMessage = friendlyRequestError(error)
        }
    }

    private func saveNewPassword() async {
        errorMessage = nil
        guard let token = AuthManager.recoveryToken(from: pastedLink) else {
            errorMessage = "That doesn't look like the reset link. Copy the whole link from the email."
            return
        }
        do {
            try await auth.completePasswordReset(
                email: email,
                token: token,
                newPassword: newPassword
            )
            withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                step = .done
            }
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription
                ?? "We couldn't reset your password. Please try again."
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
