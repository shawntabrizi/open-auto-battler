#!/usr/bin/env python3
"""Economy Agent — burns aggressively early, invests in expensive late-game cards.

Strategy: In early rounds (1-4), burn most cards to bank mana and only
play cheap filler. In later rounds, save mana for powerful expensive
cards (cost 5+). Sells cheap units to make room for upgrades.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from common import *


def decide(state):
    actions = []
    mana = state["mana"]
    hand = hand_cards(state)
    board = board_units(state)
    slots = empty_slots(state)
    round_num = state["round"]

    if not hand:
        return actions

    # Phase 1 (rounds 1-3): play only cheap cards (cost <= 2), burn the rest
    # Phase 2 (rounds 4+): play expensive powerhouses (cost >= 5), sell cheap board units
    is_early = round_num <= 3
    min_play_cost = 0 if is_early else 4

    def economy_score(c):
        """Score cards — in late game, expensive cards are valued higher."""
        base = c["attack"] + c["health"]
        if c["battle_abilities"]:
            base += 3
        if not is_early and c["play_cost"] >= 5:
            base += 5  # Late game bonus for expensive cards
        return base

    # In late game, sell cheap board units (cost <= 3) to make room for upgrades
    if not slots and not is_early and hand:
        cheap_board = [(s, u) for s, u in board if u["play_cost"] <= 3]
        expensive_hand = [(i, c) for i, c in hand if c["play_cost"] >= 5]
        if cheap_board and expensive_hand:
            cheap_board.sort(key=lambda x: economy_score(x[1]))
            actions.append(
                {"type": "BurnFromBoard", "board_slot": cheap_board[0][0]}
            )
            mana = min(mana + card_burn(cheap_board[0][1]), state["mana_limit"])
            slots = [cheap_board[0][0]]

    # Categorize hand into play candidates and burn candidates
    play_candidates = []
    burn_candidates = []

    for idx, card in hand:
        if is_early:
            # Early: only play cheap cards
            if card["play_cost"] <= 2 and slots and len(play_candidates) < len(slots):
                play_candidates.append((idx, card))
            else:
                burn_candidates.append((idx, card))
        else:
            # Late: prefer expensive cards
            if card["play_cost"] >= min_play_cost and slots and len(play_candidates) < len(slots):
                play_candidates.append((idx, card))
            else:
                burn_candidates.append((idx, card))

    # Sort play candidates by score (best first)
    play_candidates.sort(key=lambda x: economy_score(x[1]), reverse=True)

    # Ensure affordability
    to_play = list(play_candidates)
    to_burn = list(burn_candidates)

    while to_play:
        burn_mana = mana + sum(card_burn(c) for _, c in to_burn)
        burn_mana = min(burn_mana, state["mana_limit"])
        play_cost = sum(card_cost(c) for _, c in to_play)
        if burn_mana >= play_cost:
            break
        # Drop the worst play candidate
        to_play.sort(key=lambda x: economy_score(x[1]))
        moved = to_play.pop(0)
        to_burn.append(moved)

    # Execute burns
    sim_mana = mana
    for idx, card in to_burn:
        actions.append({"type": "BurnFromHand", "hand_index": idx})
        sim_mana = min(sim_mana + card_burn(card), state["mana_limit"])

    # Execute plays
    for idx, card in sorted(to_play, key=lambda x: card_cost(x[1]), reverse=True):
        if sim_mana >= card_cost(card) and slots:
            slot = slots.pop(0)
            actions.append(
                {"type": "PlayFromHand", "hand_index": idx, "board_slot": slot}
            )
            sim_mana -= card_cost(card)

    return actions


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    games = int(sys.argv[2]) if len(sys.argv) > 2 else 100
    set_id = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    client = OABClient("http://localhost:%d" % port)
    run_agent("Economy", client, decide, num_games=games, set_id=set_id)
