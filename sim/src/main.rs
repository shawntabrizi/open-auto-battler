mod analytics;
mod config;
mod games;
mod runner;
mod strategy;

use std::time::Instant;

use clap::Parser;
use rayon::prelude::*;

use oab_core::cards::{build_card_pool, get_all_sets};

use analytics::AnalyticsCollector;
use strategy::StrategyKind;

#[derive(Parser)]
#[command(name = "oab-sim", about = "Open Auto Battler — Monte Carlo Balance Simulator")]
struct Args {
    /// Game to simulate (e.g. starter_pack)
    #[arg(short, long, default_value = "starter_pack")]
    game: String,

    /// Number of simulation runs
    #[arg(short = 'n', long, default_value_t = 10_000)]
    runs: u32,

    /// Auto-play strategy: greedy, random, heuristic
    #[arg(short, long, default_value = "greedy")]
    strategy: String,

    /// Base RNG seed
    #[arg(long, default_value_t = 42)]
    seed: u64,

    /// Output JSON report to file
    #[arg(short, long)]
    output: Option<String>,

    /// Suppress console output
    #[arg(short, long)]
    quiet: bool,
}

fn main() {
    let args = Args::parse();

    let game_config = games::get_game(&args.game).unwrap_or_else(|| {
        eprintln!(
            "Unknown game: '{}'. Available: {}",
            args.game,
            games::available_games().join(", ")
        );
        std::process::exit(1);
    });

    let strategy = match args.strategy.as_str() {
        "greedy" => StrategyKind::Greedy,
        "random" => StrategyKind::Random,
        "heuristic" => StrategyKind::Heuristic,
        other => {
            eprintln!(
                "Unknown strategy: '{}'. Available: greedy, random, heuristic",
                other
            );
            std::process::exit(1);
        }
    };

    if !args.quiet {
        eprintln!(
            "OAB Monte Carlo Simulator\n  Game: {} | Runs: {} | Strategy: {} | Seed: {}",
            game_config.name(),
            args.runs,
            args.strategy,
            args.seed,
        );
    }

    if !args.quiet {
        let pool = build_card_pool();
        let sets = get_all_sets();
        let set_size = sets[game_config.set_index()].cards.len();
        eprintln!(
            "  Card pool: {} total, {} in {} set",
            pool.len(),
            set_size,
            game_config.name(),
        );
    }

    let start = Instant::now();

    let results: Vec<analytics::RunResult> = (0..args.runs)
        .into_par_iter()
        .map(|i| {
            let run_seed = args.seed.wrapping_add(i as u64 * 7919);
            runner::simulate_run(run_seed, strategy, game_config.as_ref())
        })
        .collect();

    let elapsed = start.elapsed();

    if !args.quiet {
        eprintln!(
            "  Completed {} runs in {:.2}s ({:.0} runs/sec)",
            results.len(),
            elapsed.as_secs_f64(),
            results.len() as f64 / elapsed.as_secs_f64()
        );
    }

    // Build card name map for reporting
    let card_pool = build_card_pool();
    let card_names: std::collections::HashMap<u32, String> = card_pool
        .iter()
        .map(|(id, card)| (id.0, card.name.clone()))
        .collect();

    let report = AnalyticsCollector::generate_report(&results, &args.strategy, &card_names);

    if !args.quiet {
        analytics::print_report(&report);
    }

    if let Some(path) = &args.output {
        let json = serde_json::to_string_pretty(&report).expect("Failed to serialize report");
        std::fs::write(path, json).expect("Failed to write output file");
        eprintln!("Report written to: {}", path);
    }
}
