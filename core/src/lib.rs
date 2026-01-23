use wasm_bindgen::prelude::*;

mod battle;
mod engine;
mod limits;
mod log;
mod opponents;
mod sandbox;
mod state;
mod types;
mod units;
mod view;

#[cfg(test)]
mod tests;

pub use battle::{calculate_priority_order, CombatUnit, Team};
pub use engine::GameEngine;
pub use state::*;
pub use types::*;
pub use view::*;

#[wasm_bindgen(start)]
pub fn init() {
    // Better panic messages in browser console
    console_error_panic_hook::set_once();
}

/// Simple test function to verify WASM is working
#[wasm_bindgen]
pub fn greet() -> String {
    "Hello from Manalimit WASM!".to_string()
}
