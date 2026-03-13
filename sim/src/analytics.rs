use std::collections::HashMap;

use oab_core::battle::{BattleResult, CombatEvent};
use oab_core::state::GameState;
use serde::Serialize;

// ── Data types ──────────────────────────────────────────

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct RoundSnapshot {
    pub round: i32,
    pub hand_card_ids: Vec<u32>,
    pub cards_played: usize,
    pub mana_spent: i32,
    pub mana_available: i32,
    pub player_board: Vec<u32>,
    pub enemy_encounter_name: &'static str,
    pub battle_result: BattleResult,
    pub surviving_player_cards: Vec<u32>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct RunResult {
    pub seed: u64,
    pub won: bool,
    pub rounds_survived: usize,
    pub final_wins: i32,
    pub final_lives: i32,
    pub rounds: Vec<RoundSnapshot>,
}

// ── Report types ────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct SimReport {
    pub strategy: String,
    pub total_runs: usize,
    pub win_rate: f64,
    pub win_rate_ci: f64,
    pub avg_rounds: f64,
    pub avg_wins: f64,
    pub avg_lives_remaining: f64,
    pub shannon_entropy: f64,
    pub gini_coefficient: f64,
    pub card_stats: Vec<CardStat>,
    pub encounter_stats: Vec<EncounterStat>,
    pub top_synergies: Vec<SynergyStat>,
    pub outliers: Vec<OutlierStat>,
}

#[derive(Debug, Serialize)]
pub struct CardStat {
    pub card_id: u32,
    pub name: String,
    pub times_drawn: u32,
    pub times_played: u32,
    pub play_rate: f64,
    pub play_rate_ci: f64,
    pub win_contribution: f64,
    pub win_contribution_ci: f64,
    pub survival_rate: f64,
    pub survival_rate_ci: f64,
}

#[derive(Debug, Serialize)]
pub struct EncounterStat {
    pub name: String,
    pub times_faced: u32,
    pub player_win_rate: f64,
    pub player_win_rate_ci: f64,
    pub avg_round: f64,
}

#[derive(Debug, Serialize)]
pub struct SynergyStat {
    pub card_a_id: u32,
    pub card_a_name: String,
    pub card_b_id: u32,
    pub card_b_name: String,
    pub co_occurrences: u32,
    pub combo_win_rate: f64,
    pub synergy_score: f64,
}

#[derive(Debug, Serialize)]
pub struct OutlierStat {
    pub card_id: u32,
    pub name: String,
    pub win_contribution: f64,
    pub deviation: f64,
    pub direction: String,
}

// ── Aggregation ─────────────────────────────────────────

struct CardAccum {
    drawn: u32,
    played: u32,
    wins_when_played: u32,
    survived: u32,
    times_on_board: u32,
}

struct EncounterAccum {
    faced: u32,
    player_wins: u32,
    total_round: i64,
}

struct PairAccum {
    co_occur: u32,
    co_occur_wins: u32,
}

pub struct AnalyticsCollector;

impl AnalyticsCollector {
    pub fn generate_report(
        results: &[RunResult],
        strategy: &str,
        card_names: &HashMap<u32, String>,
    ) -> SimReport {
        let total = results.len();
        let wins = results.iter().filter(|r| r.won).count();
        let win_rate = wins as f64 / total as f64;
        let avg_rounds = results.iter().map(|r| r.rounds_survived).sum::<usize>() as f64 / total as f64;
        let avg_wins = results.iter().map(|r| r.final_wins as f64).sum::<f64>() / total as f64;
        let avg_lives = results.iter().map(|r| r.final_lives.max(0) as f64).sum::<f64>() / total as f64;

        // Per-card accumulation
        let mut cards: HashMap<u32, CardAccum> = HashMap::new();
        // Per-encounter accumulation
        let mut encounters: HashMap<&str, EncounterAccum> = HashMap::new();
        // Card pair accumulation
        let mut pairs: HashMap<(u32, u32), PairAccum> = HashMap::new();

        for run in results {
            for snap in &run.rounds {
                // Drawn
                for &cid in &snap.hand_card_ids {
                    cards.entry(cid).or_insert_with(|| CardAccum {
                        drawn: 0, played: 0, wins_when_played: 0, survived: 0, times_on_board: 0,
                    }).drawn += 1;
                }

                let is_win = matches!(snap.battle_result, BattleResult::Victory);

                // Played (on board)
                for &cid in &snap.player_board {
                    let entry = cards.entry(cid).or_insert_with(|| CardAccum {
                        drawn: 0, played: 0, wins_when_played: 0, survived: 0, times_on_board: 0,
                    });
                    entry.played += 1;
                    entry.times_on_board += 1;
                    if is_win {
                        entry.wins_when_played += 1;
                    }
                }

                // Survived
                for &cid in &snap.surviving_player_cards {
                    cards.entry(cid).or_insert_with(|| CardAccum {
                        drawn: 0, played: 0, wins_when_played: 0, survived: 0, times_on_board: 0,
                    }).survived += 1;
                }

                // Encounter
                if snap.enemy_encounter_name != "none" {
                    let enc = encounters
                        .entry(snap.enemy_encounter_name)
                        .or_insert_with(|| EncounterAccum {
                            faced: 0, player_wins: 0, total_round: 0,
                        });
                    enc.faced += 1;
                    if is_win {
                        enc.player_wins += 1;
                    }
                    enc.total_round += snap.round as i64;
                }

                // Card pairs on board
                let board = &snap.player_board;
                for i in 0..board.len() {
                    for j in (i + 1)..board.len() {
                        let (a, b) = if board[i] <= board[j] {
                            (board[i], board[j])
                        } else {
                            (board[j], board[i])
                        };
                        let pair = pairs.entry((a, b)).or_insert_with(|| PairAccum {
                            co_occur: 0, co_occur_wins: 0,
                        });
                        pair.co_occur += 1;
                        if is_win {
                            pair.co_occur_wins += 1;
                        }
                    }
                }
            }
        }

        // Build card stats
        let mut card_stats: Vec<CardStat> = cards
            .iter()
            .map(|(&cid, acc)| {
                let play_rate = if acc.drawn > 0 { acc.played as f64 / acc.drawn as f64 } else { 0.0 };
                let win_contrib = if acc.played > 0 { acc.wins_when_played as f64 / acc.played as f64 } else { 0.0 };
                let surv_rate = if acc.times_on_board > 0 { acc.survived as f64 / acc.times_on_board as f64 } else { 0.0 };

                CardStat {
                    card_id: cid,
                    name: card_names.get(&cid).cloned().unwrap_or_else(|| format!("#{}", cid)),
                    times_drawn: acc.drawn,
                    times_played: acc.played,
                    play_rate,
                    play_rate_ci: ci_95(play_rate, acc.drawn),
                    win_contribution: win_contrib,
                    win_contribution_ci: ci_95(win_contrib, acc.played),
                    survival_rate: surv_rate,
                    survival_rate_ci: ci_95(surv_rate, acc.times_on_board),
                }
            })
            .collect();
        card_stats.sort_by(|a, b| b.times_played.cmp(&a.times_played));

        // Build encounter stats
        let mut encounter_stats: Vec<EncounterStat> = encounters
            .iter()
            .map(|(&name, acc)| {
                let wr = if acc.faced > 0 { acc.player_wins as f64 / acc.faced as f64 } else { 0.0 };
                EncounterStat {
                    name: name.to_string(),
                    times_faced: acc.faced,
                    player_win_rate: wr,
                    player_win_rate_ci: ci_95(wr, acc.faced),
                    avg_round: if acc.faced > 0 { acc.total_round as f64 / acc.faced as f64 } else { 0.0 },
                }
            })
            .collect();
        encounter_stats.sort_by(|a, b| a.avg_round.partial_cmp(&b.avg_round).unwrap_or(std::cmp::Ordering::Equal));

        // Individual card win rates (for synergy calculation)
        let card_win_rates: HashMap<u32, f64> = cards
            .iter()
            .map(|(&cid, acc)| {
                let wr = if acc.played > 0 { acc.wins_when_played as f64 / acc.played as f64 } else { 0.0 };
                (cid, wr)
            })
            .collect();

        // Build synergies (only pairs with >= 30 co-occurrences)
        let mut synergies: Vec<SynergyStat> = pairs
            .iter()
            .filter(|(_, acc)| acc.co_occur >= 30)
            .map(|(&(a, b), acc)| {
                let combo_wr = acc.co_occur_wins as f64 / acc.co_occur as f64;
                let a_wr = card_win_rates.get(&a).copied().unwrap_or(0.0);
                let b_wr = card_win_rates.get(&b).copied().unwrap_or(0.0);
                let synergy = combo_wr - a_wr.max(b_wr);

                SynergyStat {
                    card_a_id: a,
                    card_a_name: card_names.get(&a).cloned().unwrap_or_else(|| format!("#{}", a)),
                    card_b_id: b,
                    card_b_name: card_names.get(&b).cloned().unwrap_or_else(|| format!("#{}", b)),
                    co_occurrences: acc.co_occur,
                    combo_win_rate: combo_wr,
                    synergy_score: synergy,
                }
            })
            .collect();
        synergies.sort_by(|a, b| b.synergy_score.partial_cmp(&a.synergy_score).unwrap_or(std::cmp::Ordering::Equal));
        let top_synergies: Vec<SynergyStat> = synergies.into_iter().take(20).collect();

        // Shannon entropy over card play rates
        let shannon_entropy = compute_shannon_entropy(&card_stats);

        // Gini coefficient over card inclusion rates
        let gini_coefficient = compute_gini(&card_stats);

        // Outlier detection (>2σ from mean win contribution)
        let outliers = detect_outliers(&card_stats);

        SimReport {
            strategy: strategy.to_string(),
            total_runs: total,
            win_rate,
            win_rate_ci: ci_95(win_rate, total as u32),
            avg_rounds,
            avg_wins,
            avg_lives_remaining: avg_lives,
            shannon_entropy,
            gini_coefficient,
            card_stats,
            encounter_stats,
            top_synergies: top_synergies,
            outliers,
        }
    }
}

// ── Advanced metrics ────────────────────────────────────

/// 95% confidence interval half-width for a proportion.
fn ci_95(p: f64, n: u32) -> f64 {
    if n == 0 {
        return 0.0;
    }
    1.96 * (p * (1.0 - p) / n as f64).sqrt()
}

/// Shannon entropy: E = -SUM(p_i * log2(p_i)) over card play rates.
/// Higher = more diverse metagame.
fn compute_shannon_entropy(card_stats: &[CardStat]) -> f64 {
    let total_plays: f64 = card_stats.iter().map(|c| c.times_played as f64).sum();
    if total_plays == 0.0 {
        return 0.0;
    }

    let mut entropy = 0.0;
    for c in card_stats {
        let p = c.times_played as f64 / total_plays;
        if p > 0.0 {
            entropy -= p * p.log2();
        }
    }
    entropy
}

/// Gini coefficient over card play counts. 0 = perfect equality, 1 = max inequality.
fn compute_gini(card_stats: &[CardStat]) -> f64 {
    let n = card_stats.len();
    if n == 0 {
        return 0.0;
    }

    let mut values: Vec<f64> = card_stats.iter().map(|c| c.times_played as f64).collect();
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let mean = values.iter().sum::<f64>() / n as f64;
    if mean == 0.0 {
        return 0.0;
    }

    let mut sum_abs_diff = 0.0;
    for i in 0..n {
        for j in 0..n {
            sum_abs_diff += (values[i] - values[j]).abs();
        }
    }

    sum_abs_diff / (2.0 * n as f64 * n as f64 * mean)
}

/// Detect cards with win contribution >2σ from mean.
fn detect_outliers(card_stats: &[CardStat]) -> Vec<OutlierStat> {
    let played_cards: Vec<&CardStat> = card_stats.iter().filter(|c| c.times_played >= 10).collect();
    if played_cards.len() < 3 {
        return Vec::new();
    }

    let mean = played_cards.iter().map(|c| c.win_contribution).sum::<f64>() / played_cards.len() as f64;
    let variance = played_cards
        .iter()
        .map(|c| (c.win_contribution - mean).powi(2))
        .sum::<f64>()
        / played_cards.len() as f64;
    let std_dev = variance.sqrt();

    if std_dev < 0.001 {
        return Vec::new();
    }

    let mut outliers = Vec::new();
    for c in &played_cards {
        let dev = (c.win_contribution - mean) / std_dev;
        if dev.abs() > 2.0 {
            outliers.push(OutlierStat {
                card_id: c.card_id,
                name: c.name.clone(),
                win_contribution: c.win_contribution,
                deviation: dev,
                direction: if dev > 0.0 {
                    "overpowered".to_string()
                } else {
                    "underpowered".to_string()
                },
            });
        }
    }
    outliers.sort_by(|a, b| b.deviation.abs().partial_cmp(&a.deviation.abs()).unwrap_or(std::cmp::Ordering::Equal));
    outliers
}

// ── Survivors extraction ────────────────────────────────

/// Extract card IDs of player units that survived a battle.
pub fn extract_survivors(events: &[CombatEvent], state: &GameState) -> Vec<u32> {
    // Find the last board state from events
    let mut last_player_board: Option<&Vec<oab_core::battle::UnitView>> = None;

    for event in events.iter().rev() {
        match event {
            CombatEvent::UnitDeath { team: oab_core::battle::Team::Player, new_board_state, .. }
            | CombatEvent::UnitDeath { team: oab_core::battle::Team::Enemy, new_board_state, .. } => {
                if last_player_board.is_none() {
                    last_player_board = Some(new_board_state);
                }
            }
            CombatEvent::UnitSpawn { new_board_state, .. } => {
                if last_player_board.is_none() {
                    last_player_board = Some(new_board_state);
                }
            }
            _ => {}
        }
    }

    if let Some(board) = last_player_board {
        board
            .iter()
            .filter(|u| u.instance_id.is_player())
            .map(|u| u.card_id.0)
            .collect()
    } else {
        // No deaths/spawns means no units changed — all survived or none existed
        state
            .board
            .iter()
            .filter_map(|s| s.as_ref().map(|u| u.card_id.0))
            .collect()
    }
}

// ── Console report ──────────────────────────────────────

pub fn print_report(report: &SimReport) {
    eprintln!("\n═══════════════════════════════════════════════════════");
    eprintln!("  OAB BALANCE REPORT — Strategy: {}", report.strategy);
    eprintln!("═══════════════════════════════════════════════════════");
    eprintln!(
        "  Runs: {} | Win rate: {:.1}% (±{:.1}%) | Avg rounds: {:.1}",
        report.total_runs,
        report.win_rate * 100.0,
        report.win_rate_ci * 100.0,
        report.avg_rounds,
    );
    eprintln!(
        "  Avg wins: {:.1} | Avg lives remaining: {:.1}",
        report.avg_wins, report.avg_lives_remaining,
    );
    eprintln!(
        "  Shannon entropy: {:.2} | Gini coefficient: {:.3}",
        report.shannon_entropy, report.gini_coefficient,
    );

    // Top 15 most-played cards
    eprintln!("\n── Card Stats (top 15 by play count) ──────────────────");
    eprintln!(
        "  {:>4} {:<24} {:>6} {:>6} {:>7} {:>7} {:>7}",
        "ID", "Name", "Drawn", "Played", "Play%", "Win%", "Surv%"
    );
    for c in report.card_stats.iter().take(15) {
        eprintln!(
            "  {:>4} {:<24} {:>6} {:>6} {:>6.1}% {:>6.1}% {:>6.1}%",
            c.card_id,
            truncate(&c.name, 24),
            c.times_drawn,
            c.times_played,
            c.play_rate * 100.0,
            c.win_contribution * 100.0,
            c.survival_rate * 100.0,
        );
    }

    // Encounters
    eprintln!("\n── Encounter Stats ────────────────────────────────────");
    eprintln!(
        "  {:<24} {:>6} {:>7} {:>7}",
        "Name", "Faced", "Win%", "AvgRnd"
    );
    for e in &report.encounter_stats {
        eprintln!(
            "  {:<24} {:>6} {:>6.1}% {:>7.1}",
            truncate(&e.name, 24),
            e.times_faced,
            e.player_win_rate * 100.0,
            e.avg_round,
        );
    }

    // Top synergies
    if !report.top_synergies.is_empty() {
        eprintln!("\n── Top Synergies ──────────────────────────────────────");
        eprintln!(
            "  {:<20} + {:<20} {:>5} {:>7} {:>8}",
            "Card A", "Card B", "N", "Win%", "Synergy"
        );
        for s in report.top_synergies.iter().take(10) {
            eprintln!(
                "  {:<20} + {:<20} {:>5} {:>6.1}% {:>+7.1}%",
                truncate(&s.card_a_name, 20),
                truncate(&s.card_b_name, 20),
                s.co_occurrences,
                s.combo_win_rate * 100.0,
                s.synergy_score * 100.0,
            );
        }
    }

    // Outliers
    if !report.outliers.is_empty() {
        eprintln!("\n── Balance Outliers (>2σ) ──────────────────────────────");
        for o in &report.outliers {
            eprintln!(
                "  {} #{} — Win%: {:.1}% ({:.1}σ {})",
                o.name, o.card_id, o.win_contribution * 100.0, o.deviation.abs(), o.direction,
            );
        }
    }

    eprintln!("═══════════════════════════════════════════════════════\n");
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}…", &s[..max - 1])
    }
}
