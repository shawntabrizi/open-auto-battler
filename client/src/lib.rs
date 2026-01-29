extern crate alloc;

pub mod engine;
pub mod sandbox;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn greet() -> String {
    "Hello from Manalimit Client WASM!".into()
}
