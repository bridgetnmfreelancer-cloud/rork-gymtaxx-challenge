//
//  GymWeek.swift
//  GymTaxx
//

import Foundation

/// Week boundaries for the challenge. Weeks run Monday 00:00 to Sunday 23:59.
///
/// Fixed to London time on purpose: deposits are in pounds and reviews happen on
/// UK time, so a user checking in abroad must not have their week roll over on a
/// different day from the person approving it.
nonisolated enum GymWeek {

    /// Monday-first Gregorian calendar in London time.
    static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2 // Monday
        calendar.timeZone = TimeZone(identifier: "Europe/London") ?? .current
        return calendar
    }()

    /// The Monday 00:00 that opens the week containing `date`.
    static func monday(of date: Date) -> Date {
        calendar.dateInterval(of: .weekOfYear, for: date)?.start
            ?? calendar.startOfDay(for: date)
    }

    /// Which challenge week `date` falls in, counting from the Monday that opened
    /// the challenge. A user who joins on a Thursday is in week 0 until Sunday
    /// midnight, so their first week is genuinely short — deliberate, because
    /// weeks are calendar weeks, not personal 7-day windows.
    static func index(for date: Date, start: Date) -> Int {
        let from = monday(of: start)
        let to = monday(of: date)
        let days = calendar.dateComponents([.day], from: from, to: to).day ?? 0
        return max(0, days) / 7
    }

    /// The Sunday that closes the given challenge week.
    static func lastDay(ofWeek index: Int, start: Date) -> Date {
        let opening = monday(of: start)
        let days = (index * 7) + 6
        return calendar.date(byAdding: .day, value: days, to: opening) ?? opening
    }

    /// The Monday that opens the given challenge week.
    static func firstDay(ofWeek index: Int, start: Date) -> Date {
        let opening = monday(of: start)
        return calendar.date(byAdding: .day, value: index * 7, to: opening) ?? opening
    }
}
