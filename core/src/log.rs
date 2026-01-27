//! Logging utilities
//!
//! Provides no-op implementations for no_std builds.

#![allow(unused)]

/// Log an info message
#[inline(always)]
pub fn info(_msg: &str) {}

/// Log a warning message
#[inline(always)]
pub fn warn(_msg: &str) {}

/// Log an error message
#[inline(always)]
pub fn error(_msg: &str) {}

/// Log a debug message with a label
#[inline(always)]
pub fn debug(_label: &str, _msg: &str) {}

/// Log game state summary
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
#[inline(always)]
pub fn action(_name: &str, _details: &str) {}

/// Log action result
#[inline(always)]
pub fn result(_success: bool, _msg: &str) {}