//
//  HomeView.swift
//  GymTaxx
//

import SwiftUI

struct HomeView: View {
    @Bindable var store: ChallengeStore
    @Binding var path: [AppRoute]

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                headerCard
                progressRingCard
                statsGrid
                recentWorkoutsCard
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 120)
        }
        .background(Color.white)
        .safeAreaInset(edge: .bottom) {
            verifyButton
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    // MARK: - Header

    private var headerCard: some View {
        HStack {
            Text("GymTaxx")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(Color.navy)
            Spacer()
        }
        .padding(.top, 12)
    }

    // MARK: - Reward hero

    private var progressRingCard: some View {
        VStack(spacing: 18) {
            Text("EARNED BACK")
                .font(.system(size: 13, weight: .bold))
                .tracking(1.5)
                .foregroundStyle(Color.navy.opacity(0.45))

            Text(earnedText)
                .font(.system(size: 64, weight: .bold))
                .foregroundStyle(Color.navy)
                .contentTransition(.numericText())
                .animation(.spring(response: 0.5, dampingFraction: 0.8), value: store.earnedSoFar)

            Text("of £\(depositText) deposit")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color.navy.opacity(0.55))
        }
        .padding(.vertical, 28)
        .padding(.horizontal, 24)
        .frame(maxWidth: .infinity)
        .background(Color.appCard)
        .clipShape(.rect(cornerRadius: 24))
    }

    private var earnedText: String {
        "£" + formattedMoney(store.earnedSoFar)
    }

    private var depositText: String {
        formattedMoney(store.challenge.depositAmount)
    }

    private func formattedMoney(_ value: Double) -> String {
        value == value.rounded() ? String(Int(value)) : String(format: "%.2f", value)
    }

    // MARK: - Stats grid

    private var statsGrid: some View {
        HStack(spacing: 12) {
            statTile(
                title: "Workouts verified",
                value: "\(store.totalVerified)",
                subtitle: "logged",
                icon: "checkmark.seal.fill"
            )
            statTile(
                title: "To log this week",
                value: "\(store.remainingThisWeek)",
                subtitle: "of \(store.challenge.workoutsPerWeek)",
                icon: "figure.run"
            )
        }
    }

    private func statTile(title: String, value: String, subtitle: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Color.mintDeep)
            Text(title)
                .font(.caption)
                .foregroundStyle(Color.navy.opacity(0.55))
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(value)
                    .font(.system(size: 26, weight: .bold))
                    .foregroundStyle(Color.navy)
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(Color.navy.opacity(0.5))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Color.appCard)
        .clipShape(.rect(cornerRadius: 20))
    }

    // MARK: - Recent workouts

    private var recentWorkoutsCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("This week's check-ins")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(Color.navy)

            if store.workoutsThisWeek.isEmpty {
                Text("No check-ins yet this week. Tap Verify Workout to log your first session.")
                    .font(.subheadline)
                    .foregroundStyle(Color.navy.opacity(0.5))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 8)
            } else {
                ForEach(store.workoutsThisWeek) { workout in
                    workoutRow(workout)
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.appCard)
        .clipShape(.rect(cornerRadius: 20))
    }

    private func workoutRow(_ workout: Workout) -> some View {
        HStack(spacing: 14) {
            statusDot(workout.status)
            VStack(alignment: .leading, spacing: 2) {
                Text(workout.capturedAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.navy)
                Text(statusLabel(workout.status))
                    .font(.caption)
                    .foregroundStyle(statusColor(workout.status))
            }
            Spacer()
        }
        .padding(.vertical, 6)
    }

    private func statusDot(_ status: WorkoutStatus) -> some View {
        Circle()
            .fill(statusColor(status))
            .frame(width: 12, height: 12)
    }

    private func statusLabel(_ status: WorkoutStatus) -> String {
        switch status {
        case .verified: "Verified"
        case .pending: "Pending review"
        case .rejected: "Rejected"
        }
    }

    private func statusColor(_ status: WorkoutStatus) -> Color {
        switch status {
        case .verified: .mintDeep
        case .pending: .appAmber
        case .rejected: .appRed
        }
    }

    // MARK: - Verify CTA

    private var verifyButton: some View {
        Button {
            path.append(.verify)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 18, weight: .semibold))
                Text("Verify Workout")
                    .font(.system(size: 18, weight: .bold))
            }
            .foregroundStyle(Color.navy)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(Color.mintGreen)
            .clipShape(.rect(cornerRadius: 20))
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .buttonStyle(.plain)
        .background(Color.white)
    }
}
