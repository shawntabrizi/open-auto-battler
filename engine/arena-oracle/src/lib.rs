//! Arena v2 equivalence oracle (tests only).
//!
//! `arena` is `contract/src/main.rs` (the live `@oab/arena` version 2
//! source), compiled here as a module (see `build.rs`). Its own native tests
//! run here too. `arena::equivalence` drives it through the golden-vector
//! corpus of `oab-engine` and compares every result.

extern crate alloc;

#[cfg(test)]
#[allow(dead_code, unused_imports)]
mod arena {
    include!(concat!(env!("OUT_DIR"), "/arena.rs"));
}
