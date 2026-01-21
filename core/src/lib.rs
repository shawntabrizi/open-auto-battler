use wasm_bindgen::prelude::*;

mod types;
mod state;
mod engine;
mod view;
mod battle;
mod opponents;

#[cfg(test)]
mod tests;

pub use engine::GameEngine;
pub use types::*;
pub use state::*;
pub use view::*;
pub use battle::*;

#[wasm_bindgen(start)]
pub fn init() {
    // WASM initialization
}

/// Simple test function to verify WASM is working
#[wasm_bindgen]
pub fn greet() -> String {
    "Hello from Manalimit WASM!".to_string()
}
