//! Register all cards and sets with the OAB arena contract.
//!
//! Usage:
//!   cargo run -- <RPC_URL> <CONTRACT_ADDRESS> [FROM_ADDRESS]
//!
//! Example:
//!   cargo run -- http://localhost:8545 0x1234...abcd

use oab_assets::{cards, sets};
use oab_battle::state::CardSet;
use oab_battle::types::UnitCard;
use parity_scale_codec::Encode;
use serde_json::json;
use std::env;

// ── ABI encoding helpers ─────────────────────────────────────────────────────

fn encode_uint(value: u64) -> String {
    format!("{:064x}", value)
}

fn encode_bytes(data: &[u8]) -> String {
    let len = encode_uint(data.len() as u64);
    let hex: String = data.iter().map(|b| format!("{:02x}", b)).collect();
    let padded_len = ((hex.len() + 63) / 64) * 64;
    format!("{}{:0<width$}", len, hex, width = padded_len)
}

fn encode_register_card(card: &UnitCard) -> String {
    let scale = card.encode();
    format!("0xd6c09c1d{}{}", encode_uint(32), encode_bytes(&scale))
}

fn encode_register_set(set_id: u16, card_set: &CardSet) -> String {
    let scale = card_set.encode();
    format!("0xd8f41b6a{}{}{}", encode_uint(set_id as u64), encode_uint(64), encode_bytes(&scale))
}

// ── JSON-RPC ─────────────────────────────────────────────────────────────────

fn eth_send_transaction(
    rpc_url: &str,
    from: &str,
    to: &str,
    data: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let body = json!({
        "jsonrpc": "2.0",
        "method": "eth_sendTransaction",
        "params": [{
            "from": from,
            "to": to,
            "data": data,
            "gas": "0x1000000"
        }],
        "id": 1
    });

    let resp: serde_json::Value = ureq::post(rpc_url)
        .set("Content-Type", "application/json")
        .send_json(&body)?
        .into_json()?;

    if let Some(error) = resp.get("error") {
        return Err(format!("RPC error: {}", error).into());
    }

    Ok(resp["result"].as_str().unwrap_or("unknown").to_string())
}

fn eth_get_accounts(rpc_url: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let body = json!({
        "jsonrpc": "2.0",
        "method": "eth_accounts",
        "params": [],
        "id": 1
    });

    let resp: serde_json::Value = ureq::post(rpc_url)
        .set("Content-Type", "application/json")
        .send_json(&body)?
        .into_json()?;

    Ok(resp["result"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect())
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: {} <RPC_URL> <CONTRACT_ADDRESS> [FROM_ADDRESS]", args[0]);
        eprintln!("Example: {} http://localhost:8545 0x1234...abcd", args[0]);
        std::process::exit(1);
    }

    let rpc_url = &args[1];
    let contract_address = &args[2];
    let from_address = args.get(3);

    let from = if let Some(addr) = from_address {
        addr.clone()
    } else {
        let accounts = eth_get_accounts(rpc_url).expect("Failed to get accounts");
        if accounts.is_empty() {
            eprintln!("No accounts available. Pass a FROM_ADDRESS as 3rd argument.");
            std::process::exit(1);
        }
        println!("Using account: {}", accounts[0]);
        accounts[0].clone()
    };

    println!("=== Registering Cards and Sets ===");
    println!("RPC:      {}", rpc_url);
    println!("Contract: {}", contract_address);
    println!("From:     {}", from);
    println!();

    let all_cards = cards::get_all();
    println!("Registering {} cards...", all_cards.len());

    for (i, card) in all_cards.iter().enumerate() {
        let calldata = encode_register_card(card);
        match eth_send_transaction(rpc_url, &from, contract_address, &calldata) {
            Ok(hash) => {
                if (i + 1) % 20 == 0 || i + 1 == all_cards.len() {
                    println!("  [{}/{}] tx: {}...", i + 1, all_cards.len(), &hash[..10]);
                }
            }
            Err(e) => eprintln!("  Failed card {}: {}", card.id.0, e),
        }
    }

    let all_sets = sets::get_all();
    let set_metas = sets::get_all_metas();
    println!("\nRegistering {} sets...", all_sets.len());

    for (i, card_set) in all_sets.iter().enumerate() {
        let set_id = set_metas[i].id as u16;
        let calldata = encode_register_set(set_id, card_set);
        match eth_send_transaction(rpc_url, &from, contract_address, &calldata) {
            Ok(hash) => println!("  Set {} '{}' tx: {}...", set_id, set_metas[i].name, &hash[..10]),
            Err(e) => eprintln!("  Failed set {}: {}", set_id, e),
        }
    }

    println!("\n=== Done ===");
    println!("{} cards, {} sets registered", all_cards.len(), all_sets.len());
}
