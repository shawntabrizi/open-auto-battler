use wasm_bindgen::prelude::*;

mod types;
mod state;
mod engine;
mod view;
mod battle;
mod abilities;
mod opponents;
mod log;

#[cfg(test)]
mod tests;

pub use engine::GameEngine;
pub use types::*;
pub use state::*;
pub use view::*;
pub use battle::*;

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
