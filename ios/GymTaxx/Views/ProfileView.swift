//
//  ProfileView.swift
//  GymTaxx
//

import SwiftUI

/// Account settings. Holds sign out and, as App Store Guideline 5.1.1(v)
/// requires, in-app account deletion.
struct ProfileView: View {
    @Bindable var auth: AuthManager
    let store: ChallengeStore
    let onDismiss: () -> Void

    @State private var isConfirmingDelete = false
    @State private var isDeleting = false
    @State private var deleteError: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    identityCard
                    challengeCard
                    accountActions
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 40)
            }
            .background(Color.white)
            .navigationTitle("Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done", action: onDismiss)
                        .fontWeight(.semibold)
                        .tint(Color.mintDeep)
                }
            }
        }
        .tint(Color.navy)
        .confirmationDialog(
            "Delete your account?",
            isPresented: $isConfirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete Account", role: .destructive, action: deleteAccount)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(deleteWarning)
        }
        .alert(
            "Couldn't delete account",
            isPresented: Binding(
                get: { deleteError != nil },
                set: { if !$0 { deleteError = nil } }
            )
        ) {
            Button("OK", role: .cancel) { deleteError = nil }
        } message: {
            Text(deleteError ?? "")
        }
    }

    // MARK: - Cards

    private var identityCard: some View {
        VStack(spacing: 14) {
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 56, weight: .regular))
                .foregroundStyle(Color.mintDeep)

            if let email = auth.userEmail {
                Text(email)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Color.navy)
                    .multilineTextAlignment(.center)
            }

            Text("Signed in")
                .font(.caption)
                .foregroundStyle(Color.navy.opacity(0.45))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
        .background(Color.appCard)
        .clipShape(.rect(cornerRadius: 24))
        .padding(.top, 8)
    }

    private var challengeCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            row(
                label: "Weekly goal",
                value: "\(store.challenge.workoutsPerWeek)x a week",
                icon: "target"
            )
            divider
            row(
                label: "Deposit",
                value: store.currency.amount(store.challenge.depositAmount),
                icon: "lock.fill"
            )
            divider
            row(
                label: "Earned back",
                value: store.currency.amount(store.earnedSoFar),
                icon: "arrow.uturn.backward"
            )
        }
        .padding(.vertical, 4)
        .background(Color.appCard)
        .clipShape(.rect(cornerRadius: 20))
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.navy.opacity(0.06))
            .frame(height: 1)
            .padding(.leading, 54)
    }

    private func row(label: String, value: String, icon: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.mintDeep)
                .frame(width: 24)
            Text(label)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color.navy)
            Spacer()
            Text(value)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Color.navy.opacity(0.6))
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
    }

    // MARK: - Actions

    private var accountActions: some View {
        VStack(spacing: 12) {
            Button {
                Task { await auth.signOut() }
            } label: {
                actionLabel(
                    "Sign Out",
                    icon: "rectangle.portrait.and.arrow.right",
                    tint: Color.navy
                )
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)

            Button {
                isConfirmingDelete = true
            } label: {
                HStack(spacing: 10) {
                    if isDeleting {
                        ProgressView().tint(Color.appRed)
                    } else {
                        Image(systemName: "trash")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    Text(isDeleting ? "Deleting…" : "Delete Account")
                        .font(.system(size: 17, weight: .semibold))
                }
                .foregroundStyle(Color.appRed)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 17)
                .background(Color.appRed.opacity(0.08))
                .clipShape(.rect(cornerRadius: 18))
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)

            Text("Deleting your account removes your profile, your challenge, and every workout photo you've submitted. This can't be undone.")
                .font(.footnote)
                .foregroundStyle(Color.navy.opacity(0.45))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 8)
                .padding(.top, 4)
        }
        .padding(.top, 4)
    }

    private func actionLabel(_ title: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
            Text(title)
                .font(.system(size: 17, weight: .semibold))
        }
        .foregroundStyle(tint)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 17)
        .background(Color.appCard)
        .clipShape(.rect(cornerRadius: 18))
    }

    /// Spells out the money consequence, because a paid deposit that hasn't been
    /// earned back is the one thing deletion can't give them.
    private var deleteWarning: String {
        let unearned = store.challenge.depositAmount - store.earnedSoFar
        if store.hasPaidDeposit, unearned > 0 {
            return "Your profile, challenge, and workout photos will be permanently deleted. You still have \(store.currency.amount(unearned)) of your deposit unearned — email support@gymtaxx.com before deleting if you want to arrange a refund."
        }
        return "Your profile, challenge, and workout photos will be permanently deleted. This can't be undone."
    }

    private func deleteAccount() {
        isDeleting = true
        Task {
            do {
                try await auth.deleteAccount()
                // Signing out unmounts this sheet's parent, so no dismiss needed.
            } catch {
                deleteError = (error as? LocalizedError)?.errorDescription
                    ?? "We couldn't delete your account. Please try again."
                isDeleting = false
            }
        }
    }
}
