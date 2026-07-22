//
//  SupabaseManager.swift
//  GymTaxx
//

import Foundation
import Supabase

/// The single shared Supabase client for the app. supabase-swift owns and
/// persists the auth session (Keychain) and auto-refreshes the access token.
let supabase = SupabaseClient(
    supabaseURL: URL(string: Config.EXPO_PUBLIC_SUPABASE_URL)!,
    supabaseKey: Config.EXPO_PUBLIC_SUPABASE_ANON_KEY
)
