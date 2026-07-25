//
//  AuthView.swift
//  GymTaxx
//

import SwiftUI

/// Logged-out entry point: a simple email/password Sign Up / Log In flow that
/// matches the app's white + mint aesthetic.
struct AuthView: View {
    @Bindable var auth: AuthManager

    @State private var mode: AuthMode
    @State private var email = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    init(auth: AuthManager, startInSignUp: Bool = false) {
        _auth = Bindable(wrappedValue: auth)
        _mode = State(initialValue: startInSignUp ? .signUp : .signIn)
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 12) {
                Image(systemName: "dumbbell.fill")
                    .font(.system(size: 44, weight: .bold))
                    .foregroundStyle(Color.mintDeep)
                Text("GymTaxx")
                    .font(.system(size: 40, weight: .bold))
                    .foregroundStyle(Color.navy)
                Text(mode == .signIn ? "Welcome back." : "Put your money where your workout is.")
                    .font(.subheadline)
                    .foregroundStyle(Color.navy.opacity(0.55))
                    .multilineTextAlignment(.center)
            }
            .padding(.bottom, 36)

            VStack(spacing: 14) {
                fieldContainer {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }

                fieldContainer {
                    SecureField("Password", text: $password)
                        .textContentType(mode == .signIn ? .password : .newPassword)
                }

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(Color.appRed)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .transition(.opacity)
                }

                Button(action: submit) {
                    ZStack {
                        if isSubmitting {
                            ProgressView()
                                .tint(Color.navy)
                        } else {
                            Text(mode == .signIn ? "Log In" : "Create Account")
                                .font(.system(size: 18, weight: .bold))
                                .foregroundStyle(Color.navy)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                    .background(Color.mintGreen)
                    .clipShape(.rect(cornerRadius: 20))
                    .opacity(isFormValid ? 1 : 0.5)
                }
                .buttonStyle(.plain)
                .disabled(!isFormValid || isSubmitting)
            }
            .padding(.horizontal, 24)

            Spacer()

            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    mode = mode == .signIn ? .signUp : .signIn
                    errorMessage = nil
                }
            } label: {
                HStack(spacing: 4) {
                    Text(mode == .signIn ? "New here?" : "Already have an account?")
                        .foregroundStyle(Color.navy.opacity(0.55))
                    Text(mode == .signIn ? "Sign up" : "Log in")
                        .foregroundStyle(Color.mintDeep)
                        .fontWeight(.semibold)
                }
                .font(.subheadline)
            }
            .buttonStyle(.plain)
            .padding(.bottom, 28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.white)
    }

    private var isFormValid: Bool {
        email.contains("@") && password.count >= 6
    }

    private func fieldContainer<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .font(.system(size: 17))
            .foregroundStyle(Color.navy)
            .padding(.horizontal, 18)
            .padding(.vertical, 16)
            .background(Color.appCard)
            .clipShape(.rect(cornerRadius: 16))
    }

    private func submit() {
        errorMessage = nil
        isSubmitting = true
        let currentMode = mode
        Task {
            do {
                if currentMode == .signIn {
                    try await auth.signIn(email: email, password: password)
                } else {
                    try await auth.signUp(email: email, password: password)
                }
            } catch {
                errorMessage = friendlyMessage(from: error)
            }
            isSubmitting = false
        }
    }

    private func friendlyMessage(from error: Error) -> String {
        let text = error.localizedDescription.lowercased()
        if text.contains("invalid") && text.contains("credential") {
            return "Incorrect email or password."
        }
        if text.contains("already") && text.contains("registered") {
            return "That email is already registered. Try logging in."
        }
        return mode == .signIn
            ? "Couldn't log you in. Please try again."
            : "Couldn't create your account. Please try again."
    }
}

private enum AuthMode {
    case signIn
    case signUp
}
