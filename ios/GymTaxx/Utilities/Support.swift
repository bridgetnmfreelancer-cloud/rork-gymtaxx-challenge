//
//  Support.swift
//  GymTaxx
//

import Foundation

/// Single source of truth for how users reach a human.
enum Support {
    static let email = "support@gymtaxx.com"

    /// A pre-filled mail link. The subject carries the context so a disputed
    /// check-in arrives ready to look up rather than as "hi, problem".
    static func mailURL(subject: String) -> URL? {
        var components = URLComponents()
        components.scheme = "mailto"
        components.path = email
        components.queryItems = [URLQueryItem(name: "subject", value: subject)]
        return components.url
    }
}
