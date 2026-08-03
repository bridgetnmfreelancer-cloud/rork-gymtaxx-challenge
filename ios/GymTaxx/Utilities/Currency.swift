//
//  Currency.swift
//  GymTaxx
//

import Foundation

/// The two currencies GymTaxx prices in.
///
/// The rule is deliberately "UK or not the UK" rather than "UK or US": the app
/// charges the same numbers either way (5 per workout → 60/80/100), so opening a
/// new territory needs no code change. Euros are deferred on purpose.
///
/// A currency belongs to a *participation*, not to a user. It is decided from the
/// phone's region when someone joins and then locked, so a holiday abroad can't
/// reprice a challenge already underway, and a refund always goes back in the
/// money that came in.
nonisolated enum Currency: String, Codable, Sendable, CaseIterable {
    case gbp
    case usd

    /// Matches the `user_challenges.currency` CHECK constraint.
    var code: String { rawValue.uppercased() }

    var symbol: String {
        switch self {
        case .gbp: return "£"
        case .usd: return "$"
        }
    }

    /// SF Symbol for the reward rows in onboarding.
    var signSymbolName: String {
        switch self {
        case .gbp: return "sterlingsign.circle.fill"
        case .usd: return "dollarsign.circle.fill"
        }
    }

    /// The currency for a *new* participation, from the phone's region.
    ///
    /// Read once at join time and then stored. Falls back to dollars when the
    /// region is missing or unrecognised, which keeps the "everyone else" side of
    /// the rule true by default.
    static var forCurrentRegion: Currency {
        Locale.current.region?.identifier.uppercased() == "GB" ? .gbp : .usd
    }

    /// Decodes a stored value, tolerating anything unexpected rather than
    /// throwing — a money label must never be the reason a screen fails to load.
    init(storedValue: String?) {
        self = Currency(rawValue: storedValue?.lowercased() ?? "") ?? .gbp
    }

    /// Whole-pound / whole-dollar amounts. Every figure in the app is a multiple
    /// of the 5-per-workout reward, so pence and cents are only noise.
    func format(_ value: Double) -> String {
        value.formatted(.currency(code: code).precision(.fractionLength(0)))
    }

    func format(_ value: Int) -> String {
        format(Double(value))
    }

    /// Symbol-prefixed amount for places that build a sentence around the number
    /// and want no currency-code decoration on any locale.
    func amount(_ value: Double) -> String {
        let rounded = value.rounded()
        let whole = rounded == value
        return symbol + (whole
            ? String(Int(rounded))
            : String(format: "%.2f", value))
    }
}
