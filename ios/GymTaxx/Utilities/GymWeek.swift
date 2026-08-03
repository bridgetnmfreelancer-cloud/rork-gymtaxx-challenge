//
//  GymWeek.swift
//  GymTaxx
//

import Foundation

/// Week boundaries for one person's challenge. Weeks run Monday 00:00 to Sunday
/// 23:59 in *their* time zone.
///
/// A time zone belongs to a participation, not to the app. It is read from the
/// phone when someone joins and then stored, for the same reason the currency is:
/// a holiday or a work trip must never quietly move a deadline mid-challenge. A
/// New Yorker's Sunday ends at midnight in New York, five hours after London's.
///
/// Rows created before this existed have no stored zone and fall back to London,
/// which is exactly the schedule they have been running on — nobody's deadline
/// shifts underneath them.
nonisolated struct GymWeek: Sendable, Equatable {

    /// The zone every pre-1.1 challenge ran on, and the fallback for anything
    /// unrecognised.
    static let defaultZoneIdentifier = "Europe/London"

    static let londonZone: TimeZone =
        TimeZone(identifier: defaultZoneIdentifier) ?? TimeZone(secondsFromGMT: 0) ?? .gmt

    let timeZone: TimeZone

    /// Monday-first Gregorian calendar in this participation's zone.
    let calendar: Calendar

    init(timeZone: TimeZone) {
        self.timeZone = timeZone
        var calendar = Calendar(identifier: .gregorian)
        calendar.firstWeekday = 2 // Monday
        calendar.timeZone = timeZone
        self.calendar = calendar
    }

    /// Reads a stored zone, tolerating anything unexpected rather than failing —
    /// a bad identifier must never be the reason a week can't be calculated.
    init(storedIdentifier: String?) {
        self.init(timeZone: TimeZone(identifier: storedIdentifier ?? "") ?? Self.londonZone)
    }

    /// The zone for a *new* participation, from the phone. Read once at join time
    /// and then stored.
    static var forCurrentDevice: GymWeek { GymWeek(timeZone: .current) }

    /// London — the schedule of every challenge that started before personal time
    /// zones existed.
    static let london = GymWeek(timeZone: londonZone)

    /// The Monday 00:00 that opens the week containing `date`.
    func monday(of date: Date) -> Date {
        calendar.dateInterval(of: .weekOfYear, for: date)?.start
            ?? calendar.startOfDay(for: date)
    }

    /// Which challenge week `date` falls in, counting from the Monday that opened
    /// the challenge. A user who joins on a Thursday is in week 0 until Sunday
    /// midnight, so their first week is genuinely short — deliberate, because
    /// weeks are calendar weeks, not personal 7-day windows.
    func index(for date: Date, start: Date) -> Int {
        let from = monday(of: start)
        let to = monday(of: date)
        let days = calendar.dateComponents([.day], from: from, to: to).day ?? 0
        return max(0, days) / 7
    }

    /// The Sunday that closes the given challenge week.
    func lastDay(ofWeek index: Int, start: Date) -> Date {
        let opening = monday(of: start)
        let days = (index * 7) + 6
        return calendar.date(byAdding: .day, value: days, to: opening) ?? opening
    }

    /// The Monday that opens the given challenge week.
    func firstDay(ofWeek index: Int, start: Date) -> Date {
        let opening = monday(of: start)
        return calendar.date(byAdding: .day, value: index * 7, to: opening) ?? opening
    }

    /// The instant a challenge week's Sunday runs out — the deadline itself.
    ///
    /// Midnight that opens the following Monday, so "ends Sunday" and "counted up
    /// to Sunday midnight" are the same moment rather than one being a day out.
    func deadline(ofWeek index: Int, start: Date) -> Date {
        let opening = monday(of: start)
        let days = (index + 1) * 7
        return calendar.date(byAdding: .day, value: days, to: opening) ?? opening
    }

    /// The number of whole days between today and `date` in this zone.
    func daysUntil(_ date: Date, from now: Date = Date()) -> Int {
        let days = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: now),
            to: date
        ).day ?? 0
        return max(0, days)
    }

    /// Adds whole weeks, staying on the same wall-clock time even across a
    /// daylight-saving change.
    func adding(weeks: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: weeks * 7, to: date)
            ?? date.addingTimeInterval(Double(weeks) * 7 * 86_400)
    }

    // MARK: - Weekly starts

    /// The Monday a user joining at `date` begins on.
    ///
    /// A fresh challenge opens every Monday, so joining on a Monday starts that
    /// same day and joining any other day waits at most six. Starts stay pinned to
    /// Mondays rather than running from the moment of payment, because every week
    /// boundary in the app is a calendar week -- a personal Thursday-to-Thursday
    /// window would make "workouts this week" mean two different things.
    ///
    /// Replaces the old monthly cohorts: without pot-splitting, synchronised
    /// starts bought nothing and cost a late joiner up to five weeks of waiting.
    func weeklyStart(onOrAfter date: Date) -> Date {
        let opening = monday(of: date)
        // Already Monday: start today rather than pushing a full week out.
        if calendar.isDate(date, inSameDayAs: opening) { return opening }
        return calendar.date(byAdding: .day, value: 7, to: opening) ?? opening
    }
}
