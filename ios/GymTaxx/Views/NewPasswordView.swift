//
//  NewPasswordView.swift
//  GymTaxx
//

import SwiftUI

/// Shown after a recovery deep link opens the app, while `AuthManager` holds a
/// recovery session. `RootView` presents this ahead of the signed-in app so a
/// spent link can't become a way in without knowing the password.
struct NewPasswordView: View {
    @Bindable var auth: AuthManager

    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isSubmitting = false
    @State private var isDone = false
    @State private var errorMessage: String?

    private var isValid: Bool {
        newPassword.count >= 6 && newPassword == confirmPassword
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header

                if isDone {
                    doneStep
                } else {
                    formStep
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.white)
        .overlay(alignment: .topTrailing) {
            if !isDone { cancelButton }
        }
    }

    // MARK: - Chrome

    private var cancelButton: some View {
        Button {
            Task { await auth.cancelPasswordReset() }
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.navy.opacity(0.5))
                .padding(12)
                .background(Color.appCard, in: .circle)
        }
        .buttonStyle(.plain)
        .padding(.top, 12)
        .padding(.trailing, 20)
        .disabled(isSubmitting)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(isDone ? "Password updated" : "Choose a new password")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(Color.navy)
                .fixedSize(horizontal: false, vertical: true)

            Text(isDone
                 ? "You're all set. Log in with your new password to get back to your challenge."
                 : "Pick something at least 6 characters long. Your deposit and streak are untouched.")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color.navy.opacity(0.55))
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 56)
        .padding(.bottom, 28)
    }

    // MARK: - Steps

    private var formStep: some View {
        VStack(spacing: 14) {
            field {
                SecureField("New password", text: $newPassword)
                    .textContentType(.newPassword)
            }

            field {
                SecureField("Confirm new password", text: $confirmPassword)
                    .textContentType(.newPassword)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(Color.appRed)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            } else if !confirmPassword.isEmpty, newPassword != confirmPassword {
                Text("Those don't match yet.")
                    .font(.footnote)
                    .foregroundStyle(Color.navy.opacity(0.5))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            Button(action: save) {
                HStack(spacing: 10) {
                    if isSubmitting { ProgressView().tint(Color.navy) }
                    Text(isSubmitting ? "Saving…" : "Save new password")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(Color.navy)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
                .background(Color.mintGreen)
                .clipShape(.rect(cornerRadius: 20))
                .opacity(isValid && !isSubmitting ? 1 : 0.5)
            }
            .buttonStyle(.plain)
            .disabled(!isValid || isSubmitting)
        }
    }

    private var doneStep: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56, weight: .bold))
                .foregroundStyle(Color.mintDeep)
                .padding(.top, 12)

            Button {
                Task { await auth.cancelPasswordReset() }
            } label: {
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

    // MARK: - Actions

    private func save() {
        errorMessage = nil
        isSubmitting = true
        Task {
            do {
                try await auth.finishPasswordReset(newPassword: newPassword)
                // finishPasswordReset signs out, which clears isRecoveringPassword
                // and unmounts this view — so show the confirmation first.
                withAnimation(.spring(response: 0.35, dampingFraction: 0.9)) {
                    isDone = true
                }
            } catch {
                errorMessage = (error as? LocalizedError)?.errorDescription
                    ?? "We couldn't save your new password. Please try again."
            }
            isSubmitting = false
        }
    }
}
