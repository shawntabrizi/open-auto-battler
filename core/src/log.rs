//! Logging utilities
//!
//! Provides web-sys console logging for browser builds,
//! and no-op implementations for no_std builds.

#![allow(unused)]

#[cfg(feature = "browser")]
use alloc::format;
#[cfg(feature = "browser")]
use web_sys::console;

/// Log an info message to the browser console
#[cfg(feature = "browser")]
pub fn info(msg: &str) {
    console::log_1(&msg.into());
}

#[cfg(not(feature = "browser"))]
#[inline(always)]
pub fn info(_msg: &str) {}

/// Log a warning message to the browser console
#[cfg(feature = "browser")]
pub fn warn(msg: &str) {
    console::warn_1(&msg.into());
}

#[cfg(not(feature = "browser"))]
#[inline(always)]
pub fn warn(_msg: &str) {}

/// Log an error message to the browser console
#[cfg(feature = "browser")]
pub fn error(msg: &str) {
    console::error_1(&msg.into());
}

#[cfg(not(feature = "browser"))]
#[inline(always)]
pub fn error(_msg: &str) {}

/// Log a debug message with a label
#[cfg(feature = "browser")]
pub fn debug(label: &str, msg: &str) {
    console::log_1(&format!("[{}] {}", label, msg).into());
}

#[cfg(not(feature = "browser"))]
#[inline(always)]
pub fn debug(_label: &str, _msg: &str) {}

/// Log game state summary
#[cfg(feature = "browser")]
pub fn state_summary(
    phase: &str,
    round: i32,
    mana: i32,
    mana_limit: i32,
    lives: i32,
    wins: i32,
    bag_count: usize,
    board_count: usize,
) {
    console::log_1(
        &format!(
            "=== STATE: {} | Round {} | Mana {}/{} | Lives {} | Wins {} | Bag {} | Board {} ===",
            phase, round, mana, mana_limit, lives, wins, bag_count, board_count
        )
        .into(),
    );
}

#[cfg(not(feature = "browser"))]
#[inline(always)]
pub fn state_summary(
    _phase: &str,
    _round: i32,
    _mana: i32,
    _mana_limit: i32,
    _lives: i32,
    _wins: i32,
    _bag_count: usize,
    _board_count: usize,
) {
}

/// Log an action being performed
#[cfg(feature = "browser")]
pub fn action(name: &str, details: &str) {
    console::log_1(&format!(">> ACTION: {} - {}", name, details).into());
}

#[cfg(not(feature = "browser"))]
#[inline(always)]
pub fn action(_name: &str, _details: &str) {}

/// Log action result
#[cfg(feature = "browser")]
pub fn result(success: bool, msg: &str) {
    if success {
        console::log_1(&format!("   OK: {}", msg).into());
    } else {
        console::warn_1(&format!("   FAIL: {}", msg).into());
    }
}

#[cfg(not(feature = "browser"))]
#[inline(always)]
pub fn result(_success: bool, _msg: &str) {}
