//! On-chain game mode.
//!
//! Connects to a Substrate node, loads cards from chain storage,
//! starts/resumes games, and submits turns on-chain with local verification.

#[cfg(feature = "chain")]
mod inner {
    use std::collections::BTreeMap;
    use std::io::{self, BufRead};

    use oab_core::battle::BattleResult;
    use oab_core::state::*;
    use oab_core::types::*;
    use oab_core::view::GameView;

    use bounded_collections::ConstU32;
    use parity_scale_codec::{Decode, Encode};
    use subxt::config::SubstrateConfig;
    use subxt::dynamic::Value;
    use subxt::OnlineClient;
    use subxt_signer::sr25519::Keypair;

    use crate::protocol::*;

    const MAX_RETRIES_PER_TURN: usize = 10;

    type MaxBagSize = ConstU32<50>;
    type MaxBoardSize = ConstU32<5>;
    type MaxHandActions = ConstU32<10>;

    pub async fn run_chain_game(url: &str, suri: &str, set_id: u32) -> io::Result<()> {
        eprintln!("Connecting to {}...", url);

        let api = OnlineClient::<SubstrateConfig>::from_url(url)
            .await
            .map_err(|e| io::Error::new(io::ErrorKind::ConnectionRefused, e))?;

        eprintln!("Connected.");

        let keypair = parse_suri(suri)?;
        let account_id: subxt::utils::AccountId32 = keypair.public_key().into();
        eprintln!("Account: {}", account_id);

        // Load card pool from chain
        let card_pool = load_card_pool_from_chain(&api).await?;
        eprintln!("Loaded {} cards from chain.", card_pool.len());

        // Load card set
        let card_set = load_card_set_from_chain(&api, set_id).await?;
        eprintln!(
            "Loaded card set {} with {} entries.",
            set_id,
            card_set.cards.len()
        );

        // Check for existing active game
        let existing_session = load_active_game(&api, &account_id).await?;

        let mut state = if let Some(session) = existing_session {
            eprintln!(
                "Resuming game (round={}, wins={}, lives={}).",
                session.state.round, session.state.wins, session.state.lives
            );
            GameState::reconstruct(card_pool.clone(), session.set_id, session.state)
        } else {
            eprintln!("Starting new game with set {}...", set_id);
            submit_extrinsic(
                &api,
                &keypair,
                "AutoBattle",
                "start_game",
                vec![("set_id", Value::u128(set_id as u128))],
            )
            .await?;
            eprintln!("Game started. Fetching state...");

            let session = load_active_game(&api, &account_id).await?.ok_or_else(|| {
                io::Error::new(io::ErrorKind::Other, "Game not found after start_game")
            })?;

            eprintln!(
                "Game initialized (seed={}, round={}).",
                session.state.game_seed, session.state.round
            );
            GameState::reconstruct(card_pool.clone(), session.set_id, session.state)
        };

        if state.phase == GamePhase::Completed {
            eprintln!("Game already completed. Submitting end_game...");
            submit_extrinsic(&api, &keypair, "AutoBattle", "end_game", vec![]).await?;
            eprintln!("Game finalized.");
            return Ok(());
        }

        if state.phase != GamePhase::Shop {
            return Err(io::Error::new(
                io::ErrorKind::Other,
                format!("Unexpected phase: {:?}", state.phase),
            ));
        }

        let mut reader = io::stdin().lock();

        loop {
            // Send game state to agent
            let hand_used = vec![false; state.hand.len()];
            let view = GameView::from_state(&state, state.shop_mana, &hand_used, false);
            send_message(&EngineMessage::GameState(GameStateMsg::from_view(&view)))?;

            // Read + verify locally
            let action = match read_and_verify_turn(&mut reader, &state, &hand_used)? {
                Some(a) => a,
                None => {
                    eprintln!("Agent disconnected (EOF).");
                    return Ok(());
                }
            };

            // Submit turn on-chain
            eprintln!("Submitting turn (round {})...", state.round);
            let action_bytes = action.encode();
            submit_extrinsic(
                &api,
                &keypair,
                "AutoBattle",
                "submit_turn",
                vec![("action", Value::from_bytes(action_bytes))],
            )
            .await?;
            eprintln!("Turn submitted.");

            // Re-fetch state
            let session = load_active_game(&api, &account_id).await?;

            match session {
                Some(session) => {
                    let new_local = session.state;
                    let battle_result = if new_local.wins > state.wins {
                        BattleResult::Victory
                    } else if new_local.lives < state.lives {
                        BattleResult::Defeat
                    } else {
                        BattleResult::Draw
                    };

                    let completed_round = state.round;
                    state = GameState::reconstruct(card_pool.clone(), session.set_id, new_local);

                    send_message(&EngineMessage::BattleResult(BattleResultMsg::new(
                        &battle_result,
                        completed_round,
                        state.lives,
                        state.wins,
                    )))?;

                    if state.phase == GamePhase::Completed {
                        let result = if state.wins >= oab_core::state::WINS_TO_VICTORY {
                            "victory"
                        } else {
                            "defeat"
                        };
                        send_message(&EngineMessage::GameOver(GameOverMsg {
                            result: result.to_string(),
                            final_round: completed_round,
                            final_wins: state.wins,
                            final_lives: state.lives,
                        }))?;

                        eprintln!("Game over ({}). Submitting end_game...", result);
                        submit_extrinsic(&api, &keypair, "AutoBattle", "end_game", vec![]).await?;
                        eprintln!("Game finalized on-chain.");
                        return Ok(());
                    }
                }
                None => {
                    eprintln!("Active game removed from chain.");
                    send_message(&EngineMessage::GameOver(GameOverMsg {
                        result: "unknown".to_string(),
                        final_round: state.round,
                        final_wins: state.wins,
                        final_lives: state.lives,
                    }))?;
                    return Ok(());
                }
            }
        }
    }

    fn read_and_verify_turn(
        reader: &mut impl BufRead,
        state: &GameState,
        hand_used: &[bool],
    ) -> io::Result<Option<CommitTurnAction>> {
        for attempt in 0..MAX_RETRIES_PER_TURN {
            let input: Option<CommitTurnAction> = match read_agent_input(reader) {
                Ok(Some(action)) => Some(action),
                Ok(None) => return Ok(None),
                Err(e) => {
                    send_error(
                        &format!(
                            "Invalid JSON (attempt {}/{}): {}",
                            attempt + 1,
                            MAX_RETRIES_PER_TURN,
                            e
                        ),
                        true,
                    )?;
                    let view = GameView::from_state(state, state.shop_mana, hand_used, false);
                    send_message(&EngineMessage::GameState(GameStateMsg::from_view(&view)))?;
                    continue;
                }
            };

            let action = match input {
                Some(a) => a,
                None => return Ok(None),
            };

            let mut test_state = state.clone();
            match oab_core::commit::verify_and_apply_turn(&mut test_state, &action) {
                Ok(()) => return Ok(Some(action)),
                Err(e) => {
                    send_error(
                        &format!(
                            "Invalid turn (attempt {}/{}): {:?}",
                            attempt + 1,
                            MAX_RETRIES_PER_TURN,
                            e
                        ),
                        true,
                    )?;
                    let view = GameView::from_state(state, state.shop_mana, hand_used, false);
                    send_message(&EngineMessage::GameState(GameStateMsg::from_view(&view)))?;
                }
            }
        }

        send_error(
            &format!(
                "Max retries ({}) exceeded, ending game.",
                MAX_RETRIES_PER_TURN
            ),
            false,
        )?;
        Ok(None)
    }

    // ── Blockchain helpers ──

    fn parse_suri(suri: &str) -> io::Result<Keypair> {
        use subxt_signer::sr25519::dev;
        match suri {
            "//Alice" | "//alice" => Ok(dev::alice()),
            "//Bob" | "//bob" => Ok(dev::bob()),
            "//Charlie" | "//charlie" => Ok(dev::charlie()),
            "//Dave" | "//dave" => Ok(dev::dave()),
            "//Eve" | "//eve" => Ok(dev::eve()),
            "//Ferdie" | "//ferdie" => Ok(dev::ferdie()),
            _ => {
                let secret_uri: subxt_signer::SecretUri = suri.parse().map_err(|e| {
                    io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!("Invalid SURI '{}': {:?}", suri, e),
                    )
                })?;
                Keypair::from_uri(&secret_uri).map_err(|e| {
                    io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!("Failed to derive keypair: {:?}", e),
                    )
                })
            }
        }
    }

    async fn submit_extrinsic(
        api: &OnlineClient<SubstrateConfig>,
        keypair: &Keypair,
        pallet: &str,
        call: &str,
        args: Vec<(&str, Value)>,
    ) -> io::Result<()> {
        let tx = subxt::dynamic::tx(pallet, call, args);

        let mut progress = api
            .tx()
            .sign_and_submit_then_watch_default(&tx, keypair)
            .await
            .map_err(io_err)?;

        use subxt::tx::TxStatus;
        while let Some(status) = progress.next().await {
            match status.map_err(io_err)? {
                TxStatus::InBestBlock(block) => {
                    block.wait_for_success().await.map_err(io_err)?;
                    return Ok(());
                }
                TxStatus::InFinalizedBlock(block) => {
                    block.wait_for_success().await.map_err(io_err)?;
                    return Ok(());
                }
                TxStatus::Error { message } => {
                    return Err(io::Error::new(
                        io::ErrorKind::Other,
                        format!("Tx error: {}", message),
                    ));
                }
                TxStatus::Dropped { message } => {
                    return Err(io::Error::new(
                        io::ErrorKind::Other,
                        format!("Tx dropped: {}", message),
                    ));
                }
                TxStatus::Invalid { message } => {
                    return Err(io::Error::new(
                        io::ErrorKind::Other,
                        format!("Tx invalid: {}", message),
                    ));
                }
                _ => {}
            }
        }

        Err(io::Error::new(
            io::ErrorKind::Other,
            "Tx stream ended without inclusion",
        ))
    }

    /// Fetch raw storage bytes for a dynamic address.
    async fn fetch_raw_storage(
        api: &OnlineClient<SubstrateConfig>,
        pallet: &str,
        entry: &str,
        keys: Vec<Value>,
    ) -> io::Result<Option<Vec<u8>>> {
        let address = subxt::dynamic::storage(pallet, entry, keys);
        let key_bytes =
            subxt::ext::subxt_core::storage::get_address_bytes(&address, &api.metadata())
                .map_err(io_err)?;
        let storage = api.storage().at_latest().await.map_err(io_err)?;
        let result: Option<Vec<u8>> = storage.fetch_raw(key_bytes).await.map_err(io_err)?;
        Ok(result)
    }

    async fn load_active_game(
        api: &OnlineClient<SubstrateConfig>,
        account_id: &subxt::utils::AccountId32,
    ) -> io::Result<Option<GameSession>> {
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
                .map_err(|e| {
                    io::Error::new(
                        io::ErrorKind::InvalidData,
                        format!("Failed to decode game session: {:?}", e),
                    )
                })?;
                Ok(Some(bounded.into()))
            }
            None => Ok(None),
        }
    }

    async fn load_card_pool_from_chain(
        api: &OnlineClient<SubstrateConfig>,
    ) -> io::Result<BTreeMap<CardId, UnitCard>> {
        let mut card_pool = BTreeMap::new();

        let storage = api.storage().at_latest().await.map_err(io_err)?;
        let address = subxt::dynamic::storage("AutoBattle", "UserCards", ());
        let mut iter = storage.iter(address).await.map_err(io_err)?;

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

        let meta_address = subxt::dynamic::storage("AutoBattle", "CardMetadataStore", ());
        let mut meta_iter = storage.iter(meta_address).await.map_err(io_err)?;

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

    async fn load_card_set_from_chain(
        api: &OnlineClient<SubstrateConfig>,
        set_id: u32,
    ) -> io::Result<CardSet> {
        let raw = fetch_raw_storage(
            api,
            "AutoBattle",
            "CardSets",
            vec![Value::u128(set_id as u128)],
        )
        .await?;

        match raw {
            Some(bytes) => decode_card_set(&bytes),
            None => Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Card set {} not found on chain", set_id),
            )),
        }
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

    fn decode_card_set(bytes: &[u8]) -> io::Result<CardSet> {
        let mut input = bytes;
        let entries = Vec::<CardSetEntry>::decode(&mut input)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        Ok(CardSet { cards: entries })
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

    fn io_err<E: std::fmt::Display>(e: E) -> io::Error {
        io::Error::new(io::ErrorKind::Other, e.to_string())
    }
}

#[cfg(feature = "chain")]
pub use inner::run_chain_game;
