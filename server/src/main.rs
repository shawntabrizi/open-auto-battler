//! OAB Server — HTTP game server for AI agents to play Open Auto Battler.

mod chain;
mod local;
mod http;
mod types;

use std::env;
use std::process;

use local::GameSession;
use http::Backend;

struct Args {
    port: u16,
    set_id: u32,
    url: Option<String>,
    key: Option<String>,
    fund_targets: Vec<String>,
}

fn parse_args() -> Args {
    let args: Vec<String> = env::args().collect();
    let mut cli = Args {
        port: 3000,
        set_id: 0,
        url: None,
        key: None,
        fund_targets: Vec::new(),
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
            "--url" => {
                i += 1;
                if i < args.len() {
                    cli.url = Some(args[i].clone());
                }
            }
            "--key" => {
                i += 1;
                if i < args.len() {
                    cli.key = Some(args[i].clone());
                }
            }
            "--fund" => {
                // Collect all remaining args as target SURIs
                i += 1;
                while i < args.len() {
                    cli.fund_targets.push(args[i].clone());
                    i += 1;
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

    if cli.key.is_none() {
        cli.key = env::var("OAB_SECRET_SEED").ok();
    }

    cli
}

fn print_usage() {
    eprintln!(
        "Usage: oab-server [OPTIONS]

HTTP game server for AI agents to play Open Auto Battler.

Modes:
  Local (default)  Caller provides opponent boards each round.
  On-chain         Provide --url and --key to play on a live blockchain.

Endpoints:
  POST /reset   Start new game {{ \"seed\": N, \"set_id\": N }}
  POST /submit  Submit actions {{ \"actions\": [...], \"opponent\": [...] }}
  GET  /state   Get current game state
  GET  /cards   List all cards
  GET  /sets    List available card sets

Options:
  --port <N>        Server port (default: 3000)
  --set <N>         Default card set ID (default: 0)
  --url <WS_URL>    Chain RPC endpoint (enables on-chain mode)
  --key <SURI>      Secret key/SURI for signing (or set OAB_SECRET_SEED)
  --fund <SURI...>  Fund accounts via sudo and exit (--key must be sudo key)
  --help            Print this help"
    );
}

fn main() {
    let args = parse_args();

    // Fund mode: fund target accounts and exit
    if !args.fund_targets.is_empty() {
        #[cfg(feature = "chain")]
        {
            let url = args.url.as_deref().unwrap_or_else(|| {
                eprintln!("Error: --url required for --fund mode.");
                process::exit(1);
            });
            let key = args.key.as_deref().unwrap_or_else(|| {
                eprintln!("Error: --key required for --fund mode (must be sudo key).");
                process::exit(1);
            });
            eprintln!("Funding {} accounts...", args.fund_targets.len());
            if let Err(e) = chain::fund_accounts(url, key, &args.fund_targets) {
                eprintln!("Error funding accounts: {}", e);
                process::exit(1);
            }
            eprintln!("All accounts funded.");
            process::exit(0);
        }
        #[cfg(not(feature = "chain"))]
        {
            eprintln!("Error: --fund requires the 'chain' feature.");
            process::exit(1);
        }
    }

    let backend = if let Some(url) = &args.url {
        // On-chain mode
        #[cfg(feature = "chain")]
        {
            let key = match &args.key {
                Some(k) => k.clone(),
                None => {
                    eprintln!("Error: --key or OAB_SECRET_SEED required for on-chain mode.");
                    process::exit(1);
                }
            };

            eprintln!("Starting on-chain mode...");
            match chain::ChainGameSession::new(url, &key, args.set_id) {
                Ok(session) => Backend::Chain(session),
                Err(e) => {
                    eprintln!("Error: {}", e);
                    process::exit(1);
                }
            }
        }

        #[cfg(not(feature = "chain"))]
        {
            let _ = url;
            eprintln!("Error: Chain mode requires the 'chain' feature.");
            eprintln!("Build with: cargo build -p oab-server");
            process::exit(1);
        }
    } else {
        // Local mode
        let seed = http::generate_seed();
        eprintln!("Starting local mode (set={})...", args.set_id);
        match GameSession::new(seed, args.set_id) {
            Ok(session) => Backend::Local(session),
            Err(e) => {
                eprintln!("Error: {}", e);
                process::exit(1);
            }
        }
    };

    if let Err(e) = http::serve(args.port, backend) {
        eprintln!("Error: {}", e);
        process::exit(1);
    }
}
