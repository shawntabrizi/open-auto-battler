//! On-chain game backend.
//!
//! Implements GameBackend by proxying to a Substrate blockchain.
//! Cards are loaded from chain storage. Turns are verified locally
//! then submitted as extrinsics.

#[cfg(feature = "chain")]
mod inner {
    use std::collections::BTreeMap;

    use oab_core::battle::BattleResult;
    use oab_core::state::*;
    use oab_core::types::*;
    use oab_core::view::GameView;

    use bounded_collections::ConstU32;
    use parity_scale_codec::Decode;
    use subxt::config::SubstrateConfig;
    use subxt::dynamic::Value;
    use subxt::OnlineClient;
    use subxt_signer::sr25519::Keypair;
    use tokio::runtime::Runtime;

    use crate::game::GameBackend;
    use crate::types::{BattleSummary, GameStateResponse, StepResponse};

    type MaxBagSize = ConstU32<50>;
    type MaxBoardSize = ConstU32<5>;
    type MaxHandActions = ConstU32<10>;

    /// On-chain game session that submits turns to a Substrate blockchain.
    pub struct ChainGameSession {
        api: OnlineClient<SubstrateConfig>,
        keypair: Keypair,
        account_id: subxt::utils::AccountId32,
        card_pool: BTreeMap<CardId, UnitCard>,
        state: Option<GameState>,
        set_id: u32,
        rt: Runtime,
    }

    impl ChainGameSession {
        /// Connect to a chain and create a new session.
        pub fn new(url: &str, suri: &str, set_id: u32) -> Result<Self, String> {
            let rt = Runtime::new().map_err(|e| format!("Failed to create runtime: {}", e))?;

            let api = rt
                .block_on(OnlineClient::<SubstrateConfig>::from_url(url))
                .map_err(|e| format!("Failed to connect to {}: {}", url, e))?;

            let keypair = parse_suri(suri)?;
            let account_id: subxt::utils::AccountId32 = keypair.public_key().into();

            eprintln!("Connected to {}", url);
            eprintln!("Account: {}", account_id);

            // Load card pool from chain
            let card_pool = rt
                .block_on(load_card_pool_from_chain(&api))
                .map_err(|e| format!("Failed to load cards: {}", e))?;
            eprintln!("Loaded {} cards from chain.", card_pool.len());

            // Check for existing active game
            let existing = rt
                .block_on(load_active_game(&api, &account_id))
                .map_err(|e| format!("Failed to check active game: {}", e))?;

            let state = if let Some(session) = existing {
                eprintln!(
                    "Resuming game (round={}, wins={}, lives={}).",
                    session.state.round, session.state.wins, session.state.lives
                );
                Some(GameState::reconstruct(
                    card_pool.clone(),
                    session.set_id,
                    session.state,
                ))
            } else {
                None
            };

            Ok(Self {
                api,
                keypair,
                account_id,
                card_pool,
                state,
                set_id,
                rt,
            })
        }

        fn sync_state_from_chain(&mut self) -> Result<(), String> {
            let session = self
                .rt
                .block_on(load_active_game(&self.api, &self.account_id))
                .map_err(|e| format!("Failed to fetch game state: {}", e))?;

            match session {
                Some(session) => {
                    self.state = Some(GameState::reconstruct(
                        self.card_pool.clone(),
                        session.set_id,
                        session.state,
                    ));
                    Ok(())
                }
                None => {
                    self.state = None;
                    Ok(())
                }
            }
        }
    }

    impl GameBackend for ChainGameSession {
        fn reset(&mut self, _seed: u64, set_id: Option<u32>) -> Result<GameStateResponse, String> {
            let set_id = set_id.unwrap_or(self.set_id);

            // If there's an existing completed game, end it first
            if let Some(ref state) = self.state {
                if state.phase == GamePhase::Completed {
                    eprintln!("Ending completed game...");
                    self.rt
                        .block_on(submit_extrinsic(
                            &self.api,
                            &self.keypair,
                            "AutoBattle",
                            "end_game",
                            vec![],
                        ))
                        .map_err(|e| format!("Failed to end game: {}", e))?;
                }
            }

            // Check if there's still an active game
            self.sync_state_from_chain()?;
            if self.state.is_some() {
                return Err(
                    "Active game exists on-chain. Complete it first or use a different account."
                        .into(),
                );
            }

            // Start new game on-chain (seed is determined by chain randomness)
            eprintln!("Starting new game with set {}...", set_id);
            self.rt
                .block_on(submit_extrinsic(
                    &self.api,
                    &self.keypair,
                    "AutoBattle",
                    "start_game",
                    vec![("set_id", Value::u128(set_id as u128))],
                ))
                .map_err(|e| format!("Failed to start game: {}", e))?;

            self.set_id = set_id;
            self.sync_state_from_chain()?;

            match &self.state {
                Some(state) => {
                    eprintln!("Game started (round={}).", state.round);
                    Ok(self.get_state())
                }
                None => Err("Game not found after start_game".into()),
            }
        }

        fn step(&mut self, action: &CommitTurnAction) -> Result<StepResponse, String> {
            let state = self
                .state
                .as_ref()
                .ok_or("No active game. Call POST /reset first.")?;

            if state.phase == GamePhase::Completed {
                return Err("Game is already over. Call POST /reset to start a new game.".into());
            }
            if state.phase != GamePhase::Shop {
                return Err(format!("Wrong phase: {:?}", state.phase));
            }

            // Local verification first
            let mut test_state = state.clone();
            oab_core::commit::verify_and_apply_turn(&mut test_state, action)
                .map_err(|e| format!("{:?}", e))?;

            let prev_wins = state.wins;
            let prev_lives = state.lives;
            let completed_round = state.round;

            // Submit on-chain
            eprintln!("Submitting turn (round {})...", completed_round);
            let action_value = commit_turn_action_to_value(action);
            self.rt
                .block_on(submit_extrinsic(
                    &self.api,
                    &self.keypair,
                    "AutoBattle",
                    "submit_turn",
                    vec![("action", action_value)],
                ))
                .map_err(|e| format!("Failed to submit turn: {}", e))?;

            // Sync state from chain
            self.sync_state_from_chain()?;

            let state = self
                .state
                .as_ref()
                .ok_or("Game disappeared after submit_turn")?;

            // Determine battle result
            let battle_result = if state.wins > prev_wins {
                BattleResult::Victory
            } else if state.lives < prev_lives {
                BattleResult::Defeat
            } else {
                BattleResult::Draw
            };

            let game_over = state.phase == GamePhase::Completed;
            let game_result = if game_over {
                let result = if state.wins >= oab_core::state::WINS_TO_VICTORY {
                    "victory"
                } else {
                    "defeat"
                };

                // Auto-submit end_game
                eprintln!("Game over ({}). Submitting end_game...", result);
                let _ = self.rt.block_on(submit_extrinsic(
                    &self.api,
                    &self.keypair,
                    "AutoBattle",
                    "end_game",
                    vec![],
                ));

                Some(result.to_string())
            } else {
                None
            };

            let reward = match &battle_result {
                BattleResult::Victory => 1,
                BattleResult::Defeat => -1,
                BattleResult::Draw => 0,
            };

            let battle_result_str = match &battle_result {
                BattleResult::Victory => "Victory",
                BattleResult::Defeat => "Defeat",
                BattleResult::Draw => "Draw",
            };

            eprintln!(
                "Round {}: {} (wins={}, lives={})",
                completed_round, battle_result_str, state.wins, state.lives
            );

            // Count surviving units from refreshed state
            let player_units_survived = state.board.iter().filter(|s| s.is_some()).count();

            Ok(StepResponse {
                completed_round,
                battle_result: battle_result_str.to_string(),
                game_over,
                game_result,
                reward,
                battle_summary: BattleSummary {
                    player_units_survived,
                    enemy_units_faced: 0, // Not available from chain state alone
                },
                state: self.get_state(),
            })
        }

        fn get_state(&self) -> GameStateResponse {
            match &self.state {
                Some(state) => {
                    let hand_used = vec![false; state.hand.len()];
                    let view = GameView::from_state(state, state.shop_mana, &hand_used, false);
                    view.into()
                }
                None => GameStateResponse {
                    round: 0,
                    lives: 0,
                    wins: 0,
                    mana: 0,
                    mana_limit: 0,
                    phase: "none".to_string(),
                    bag_count: 0,
                    hand: vec![],
                    board: vec![],
                    can_afford: vec![],
                    hints: vec!["No active game. Call POST /reset to start.".into()],
                },
            }
        }

        fn get_cards(&self) -> Vec<oab_core::view::CardView> {
            self.card_pool
                .values()
                .map(oab_core::view::CardView::from)
                .collect()
        }
    }

    // ── Blockchain helpers ──

    fn parse_suri(suri: &str) -> Result<Keypair, String> {
        use subxt_signer::sr25519::dev;
        match suri {
            "//Alice" | "//alice" => Ok(dev::alice()),
            "//Bob" | "//bob" => Ok(dev::bob()),
            "//Charlie" | "//charlie" => Ok(dev::charlie()),
            "//Dave" | "//dave" => Ok(dev::dave()),
            "//Eve" | "//eve" => Ok(dev::eve()),
            "//Ferdie" | "//ferdie" => Ok(dev::ferdie()),
            _ => {
                let secret_uri: subxt_signer::SecretUri =
                    suri.parse().map_err(|e| format!("Invalid SURI: {:?}", e))?;
                Keypair::from_uri(&secret_uri)
                    .map_err(|e| format!("Failed to derive keypair: {:?}", e))
            }
        }
    }

    async fn submit_extrinsic(
        api: &OnlineClient<SubstrateConfig>,
        keypair: &Keypair,
        pallet: &str,
        call: &str,
        args: Vec<(&str, Value)>,
    ) -> Result<(), String> {
        let tx = subxt::dynamic::tx(pallet, call, args);

        let mut progress = api
            .tx()
            .sign_and_submit_then_watch_default(&tx, keypair)
            .await
            .map_err(|e| format!("Tx submission failed: {}", e))?;

        use subxt::tx::TxStatus;
        while let Some(status) = progress.next().await {
            match status.map_err(|e| format!("Tx status error: {}", e))? {
                TxStatus::InBestBlock(block) => {
                    block
                        .wait_for_success()
                        .await
                        .map_err(|e| format!("Tx failed: {}", e))?;
                    return Ok(());
                }
                TxStatus::InFinalizedBlock(block) => {
                    block
                        .wait_for_success()
                        .await
                        .map_err(|e| format!("Tx failed: {}", e))?;
                    return Ok(());
                }
                TxStatus::Error { message } => return Err(format!("Tx error: {}", message)),
                TxStatus::Dropped { message } => return Err(format!("Tx dropped: {}", message)),
                TxStatus::Invalid { message } => return Err(format!("Tx invalid: {}", message)),
                _ => {}
            }
        }

        Err("Tx stream ended without inclusion".into())
    }

    async fn fetch_raw_storage(
        api: &OnlineClient<SubstrateConfig>,
        pallet: &str,
        entry: &str,
        keys: Vec<Value>,
    ) -> Result<Option<Vec<u8>>, String> {
        let address = subxt::dynamic::storage(pallet, entry, keys);
        let key_bytes =
            subxt::ext::subxt_core::storage::get_address_bytes(&address, &api.metadata())
                .map_err(|e| format!("Storage key error: {}", e))?;
        let storage = api
            .storage()
            .at_latest()
            .await
            .map_err(|e| format!("Storage error: {}", e))?;
        let result: Option<Vec<u8>> = storage
            .fetch_raw(key_bytes)
            .await
            .map_err(|e| format!("Fetch error: {}", e))?;
        Ok(result)
    }

    async fn load_active_game(
        api: &OnlineClient<SubstrateConfig>,
        account_id: &subxt::utils::AccountId32,
    ) -> Result<Option<GameSession>, String> {
        let raw = fetch_raw_storage(
            api,
            "AutoBattle",
            "ActiveGame",
            vec![Value::from_bytes(account_id.0)],
        )
        .await?;

        match raw {
            Some(bytes) => {
                let mut input = &bytes[..];
                let bounded = oab_core::bounded::BoundedGameSession::<
                    MaxBagSize,
                    MaxBoardSize,
                    MaxHandActions,
                >::decode(&mut input)
                .map_err(|e| format!("Failed to decode game session: {:?}", e))?;
                Ok(Some(bounded.into()))
            }
            None => Ok(None),
        }
    }

    async fn load_card_pool_from_chain(
        api: &OnlineClient<SubstrateConfig>,
    ) -> Result<BTreeMap<CardId, UnitCard>, String> {
        let mut card_pool = BTreeMap::new();

        let storage = api
            .storage()
            .at_latest()
            .await
            .map_err(|e| format!("Storage error: {}", e))?;
        let address = subxt::dynamic::storage("AutoBattle", "UserCards", ());
        let mut iter = storage
            .iter(address)
            .await
            .map_err(|e| format!("Iter error: {}", e))?;

        while let Some(Ok(kv)) = iter.next().await {
            if let Ok(card_data) = decode_user_card_data(kv.value.encoded()) {
                let card_id = extract_card_id_from_key(&kv.key_bytes);
                card_pool.insert(
                    CardId(card_id),
                    UnitCard {
                        id: CardId(card_id),
                        name: String::new(),
                        stats: card_data.0,
                        economy: card_data.1,
                        shop_abilities: card_data.2,
                        battle_abilities: card_data.3,
                    },
                );
            }
        }

        // Load card names
        let meta_address = subxt::dynamic::storage("AutoBattle", "CardMetadataStore", ());
        let mut meta_iter = storage
            .iter(meta_address)
            .await
            .map_err(|e| format!("Meta iter error: {}", e))?;

        while let Some(Ok(kv)) = meta_iter.next().await {
            let card_id = extract_card_id_from_key(&kv.key_bytes);
            if let Some(card) = card_pool.get_mut(&CardId(card_id)) {
                if let Ok(name) = decode_card_name(kv.value.encoded()) {
                    card.name = name;
                }
            }
        }

        Ok(card_pool)
    }

    // ── Value encoding helpers ──

    /// Convert a CommitTurnAction to a subxt dynamic Value matching the pallet's type.
    fn commit_turn_action_to_value(action: &CommitTurnAction) -> Value {
        let actions: Vec<Value> = action
            .actions
            .iter()
            .map(|a| match a {
                TurnAction::BurnFromHand { hand_index } => Value::named_variant(
                    "BurnFromHand",
                    [("hand_index", Value::u128(*hand_index as u128))],
                ),
                TurnAction::PlayFromHand {
                    hand_index,
                    board_slot,
                } => Value::named_variant(
                    "PlayFromHand",
                    [
                        ("hand_index", Value::u128(*hand_index as u128)),
                        ("board_slot", Value::u128(*board_slot as u128)),
                    ],
                ),
                TurnAction::BurnFromBoard { board_slot } => Value::named_variant(
                    "BurnFromBoard",
                    [("board_slot", Value::u128(*board_slot as u128))],
                ),
                TurnAction::SwapBoard { slot_a, slot_b } => Value::named_variant(
                    "SwapBoard",
                    [
                        ("slot_a", Value::u128(*slot_a as u128)),
                        ("slot_b", Value::u128(*slot_b as u128)),
                    ],
                ),
                TurnAction::MoveBoard { from_slot, to_slot } => Value::named_variant(
                    "MoveBoard",
                    [
                        ("from_slot", Value::u128(*from_slot as u128)),
                        ("to_slot", Value::u128(*to_slot as u128)),
                    ],
                ),
            })
            .collect();

        Value::named_composite([("actions", Value::unnamed_composite(actions))])
    }

    // ── SCALE decoding helpers ──

    fn decode_user_card_data(
        bytes: &[u8],
    ) -> Result<(UnitStats, EconomyStats, Vec<ShopAbility>, Vec<Ability>), parity_scale_codec::Error>
    {
        let mut input = bytes;
        let stats = UnitStats::decode(&mut input)?;
        let economy = EconomyStats::decode(&mut input)?;
        let shop_abilities = Vec::<ShopAbility>::decode(&mut input)?;
        let battle_abilities = Vec::<Ability>::decode(&mut input)?;
        Ok((stats, economy, shop_abilities, battle_abilities))
    }

    fn decode_card_name(bytes: &[u8]) -> Result<String, parity_scale_codec::Error> {
        let mut input = bytes;
        let _creator = <[u8; 32]>::decode(&mut input)?;
        let name_bytes = Vec::<u8>::decode(&mut input)?;
        Ok(String::from_utf8_lossy(&name_bytes).to_string())
    }

    fn extract_card_id_from_key(key_bytes: &[u8]) -> u32 {
        if key_bytes.len() >= 4 {
            let offset = key_bytes.len() - 4;
            u32::from_le_bytes([
                key_bytes[offset],
                key_bytes[offset + 1],
                key_bytes[offset + 2],
                key_bytes[offset + 3],
            ])
        } else {
            0
        }
    }
}

#[cfg(feature = "chain")]
pub use inner::ChainGameSession;
