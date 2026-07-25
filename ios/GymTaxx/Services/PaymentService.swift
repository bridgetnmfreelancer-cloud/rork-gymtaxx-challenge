//
//  PaymentService.swift
//  GymTaxx
//

import Foundation
import Supabase

/// What the server says about the user's deposit.
///
/// The amount is calculated server-side from the goal they committed to, so the
/// app can display it but never chooses it.
nonisolated struct DepositPaymentSession: Codable, Sendable {
    let status: String
    let clientSecret: String?
    let publishableKey: String?
    let amountMinor: Int?
    let currency: String?

    /// True when the deposit is already settled and there is nothing to pay.
    var isPaid: Bool { status == "paid" }

    /// The deposit in pounds, for display only.
    var amount: Double? {
        amountMinor.map { Double($0) / 100 }
    }
}

nonisolated enum PaymentServiceError: LocalizedError {
    case noParticipation
    case missingClientSecret
    case requestFailed

    var errorDescription: String? {
        switch self {
        case .noParticipation:
            return "We couldn't find your challenge place. Please restart the app and try again."
        case .missingClientSecret:
            return "We couldn't start the payment. Please try again."
        case .requestFailed:
            return "We couldn't reach the payment service. Check your connection and try again."
        }
    }
}

/// Starts the deposit payment. All the sensitive work — pricing the deposit,
/// creating the Stripe PaymentIntent, and later marking it paid — happens on the
/// server; the app only ever handles a client secret.
nonisolated enum PaymentService {

    static func startDepositPayment() async throws -> DepositPaymentSession {
        do {
            let session: DepositPaymentSession = try await supabase.functions.invoke(
                "create-deposit-payment",
                options: .init(method: .post)
            )
            return session
        } catch {
            #if DEBUG
            NSLog("%@", "GymTaxx deposit: create-deposit-payment failed: \(String(reflecting: error))")
            #endif
            throw PaymentServiceError.requestFailed
        }
    }
}
