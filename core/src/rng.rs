//! Deterministic RNG for battle resolution
//!
//! This module provides a no_std compatible RNG trait and implementation.
//! Substrate provides block hash as seed, browser WASM uses JavaScript seed.

use parity_scale_codec::{Decode, Encode};
use scale_info::TypeInfo;

/// Trait for random number generation in battles
pub trait BattleRng {
    /// Generate a random u32
    fn next_u32(&mut self) -> u32;

    /// Generate a random number in range [0, max)
    fn gen_range(&mut self, max: usize) -> usize {
        if max == 0 {
            return 0;
        }
        (self.next_u32() as usize) % max
    }

    /// Shuffle a slice using Fisher-Yates algorithm
    fn shuffle<T>(&mut self, slice: &mut [T]) {
        for i in (1..slice.len()).rev() {
            let j = self.gen_range(i + 1);
            slice.swap(i, j);
        }
    }
}

/// XorShift32 RNG - simple, fast, deterministic
///
/// This is suitable for game logic where cryptographic security is not needed.
/// The same seed will always produce the same sequence.
#[derive(Debug, Clone, Encode, Decode, TypeInfo)]
pub struct XorShiftRng {
    state: u32,
}

impl XorShiftRng {
    /// Create a new RNG from a u64 seed
    ///
    /// The seed is combined into a u32, ensuring state is never 0.
    pub fn seed_from_u64(seed: u64) -> Self {
        // Combine both halves and ensure non-zero
        let state = ((seed as u32) ^ ((seed >> 32) as u32)).max(1);
        Self { state }
    }

    /// Create a new RNG from a u32 seed
    pub fn seed_from_u32(seed: u32) -> Self {
        Self {
            state: seed.max(1),
        }
    }
}

impl BattleRng for XorShiftRng {
    fn next_u32(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.state = x;
        x
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xorshift_deterministic() {
        let mut rng1 = XorShiftRng::seed_from_u64(12345);
        let mut rng2 = XorShiftRng::seed_from_u64(12345);

        for _ in 0..100 {
            assert_eq!(rng1.next_u32(), rng2.next_u32());
        }
    }

    #[test]
    fn test_xorshift_different_seeds() {
        let mut rng1 = XorShiftRng::seed_from_u64(12345);
        let mut rng2 = XorShiftRng::seed_from_u64(54321);

        // Very unlikely to be equal with different seeds
        assert_ne!(rng1.next_u32(), rng2.next_u32());
    }

    #[test]
    fn test_gen_range() {
        let mut rng = XorShiftRng::seed_from_u64(42);

        for _ in 0..100 {
            let val = rng.gen_range(10);
            assert!(val < 10);
        }
    }

    #[test]
    fn test_shuffle() {
        let mut rng = XorShiftRng::seed_from_u64(42);
        let mut arr = [1, 2, 3, 4, 5];
        let original = arr;

        rng.shuffle(&mut arr);

        // Shuffled array should contain same elements
        let mut sorted = arr;
        sorted.sort();
        assert_eq!(sorted, [1, 2, 3, 4, 5]);

        // Very unlikely to be in same order after shuffle
        assert_ne!(arr, original);
    }
}
