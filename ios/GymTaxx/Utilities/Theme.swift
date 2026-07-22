//
//  Theme.swift
//  GymTaxx
//

import SwiftUI

/// Centralized brand colors and shared styling for GymTaxx.
enum Theme {
    static let white = Color(hex: 0xFFFFFF)
    static let card = Color(hex: 0xF8FAFC)
    static let navy = Color(hex: 0x0F172A)
    static let mint = Color(hex: 0x86EFAC)
    static let mintDeep = Color(hex: 0x4ADE80)
    static let red = Color(hex: 0xF87171)
    static let amber = Color(hex: 0xFBBF24)
}

extension Color {
    init(hex: UInt, alpha: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

// Convenience named aliases used across views.
extension Color {
    static let mintGreen = Color(hex: 0x86EFAC)
    static let mintDeep = Color(hex: 0x4ADE80)
    static let navy = Color(hex: 0x0F172A)
    static let appCard = Color(hex: 0xF8FAFC)
    static let appAmber = Color(hex: 0xFBBF24)
    static let appRed = Color(hex: 0xF87171)
}
