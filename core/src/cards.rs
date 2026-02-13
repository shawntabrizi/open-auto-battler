//! Statically compiled card data from /cards/cards.json and /cards/sets.json.
//! Generated at build time by build.rs — no runtime JSON parsing needed.
//! This module is always available (no_std compatible via alloc).

include!(concat!(env!("OUT_DIR"), "/cards_generated.rs"));
