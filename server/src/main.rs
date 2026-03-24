//! OAB Server — HTTP game server for AI agents to play Open Auto Battler.

mod chain;
mod game;
mod http;
mod types;

use std::env;
use std::process;

struct Args {
    port: u16,
    set_id: u32,
}

fn parse_args() -> Args {
    let args: Vec<String> = env::args().collect();
    let mut cli = Args {
        port: 3000,
        set_id: 0,
    };

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--port" | "-p" => {
                i += 1;
                if i < args.len() {
                    cli.port = args[i].parse().unwrap_or(3000);
                }
            }
            "--set" => {
                i += 1;
                if i < args.len() {
                    cli.set_id = args[i].parse().unwrap_or(0);
                }
            }
            "--help" | "-h" => {
                print_usage();
                process::exit(0);
            }
            other => {
                eprintln!("Unknown argument: {}", other);
                print_usage();
                process::exit(1);
            }
        }
        i += 1;
    }

    cli
}

fn print_usage() {
    eprintln!(
        "Usage: oab-server [OPTIONS]

HTTP game server for AI agents to play Open Auto Battler.

Endpoints:
  POST /reset  Start new game {{ \"seed\": N, \"set_id\": N }}
  POST /step   Submit actions {{ \"actions\": [...] }}
  GET  /state  Get current game state

Options:
  --port <N>   Server port (default: 3000)
  --set <N>    Default card set ID (default: 0)
  --help       Print this help"
    );
}

fn main() {
    let args = parse_args();

    if let Err(e) = http::serve(args.port, args.set_id) {
        eprintln!("Error: {}", e);
        process::exit(1);
    }
}
