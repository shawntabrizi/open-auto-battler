//! Copy the arena v2 source into OUT_DIR so the tests can compile it as a
//! module. Only the crate-level header (`//!` docs and the `#![cfg_attr]`
//! no_std line) is dropped, because inner attributes are not allowed inside
//! `include!`. Every other line is the arena source unchanged. The copy also
//! declares the `equivalence` test module as a child, so it can see the
//! arena's private items, and points `env!("CARGO_MANIFEST_DIR")` at
//! `contract/` so the arena's own fixture test finds `web/`.

use std::{env, fs, path::PathBuf};

fn main() {
    let dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let src = dir.join("../../contract/src/main.rs");
    println!("cargo:rerun-if-changed={}", src.display());
    println!("cargo:rerun-if-changed=src/equivalence.rs");
    let text = fs::read_to_string(&src).expect("read contract/src/main.rs");
    let mut out = String::new();
    let mut header = true;
    for line in text.lines() {
        if header {
            let t = line.trim_start();
            if t.starts_with("//!") || t.is_empty() {
                continue;
            }
            if t.starts_with("#![") {
                assert!(
                    t.starts_with("#![cfg_attr(not(any(test, feature = \"std\", feature = \"abi-gen\")), no_main, no_std)]"),
                    "unexpected crate attribute in the arena header: {t}"
                );
                continue;
            }
            header = false;
        }
        // `#![abi_import(..)]` lives inside `abi_import!` bodies; that is fine.
        let t = line.trim_start();
        assert!(
            !t.starts_with("#![") || t.starts_with("#![abi_import("),
            "inner attribute after the header: {t}"
        );
        out.push_str(line);
        out.push('\n');
    }
    // The arena's fixture test finds `web/` from its own manifest dir.
    let contract_dir = dir.join("../../contract").canonicalize().unwrap();
    let out = out.replace(
        "env!(\"CARGO_MANIFEST_DIR\")",
        &format!("{:?}", contract_dir.display().to_string()),
    );
    let mut out = out;
    let eq = dir.join("src/equivalence.rs");
    out.push_str(&format!(
        "\n#[cfg(test)]\n#[path = {:?}]\nmod equivalence;\n",
        eq.display().to_string()
    ));
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    fs::write(out_dir.join("arena.rs"), out).unwrap();
}
