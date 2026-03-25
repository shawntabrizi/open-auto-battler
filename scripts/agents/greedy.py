#!/usr/bin/env python3
"""Greedy Agent — plays the highest value-per-mana cards each turn.

Strategy: Maximize board value by playing cards with the best
stats-to-cost ratio. Burns the least efficient cards for mana.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from common import *


def decide(state):
    actions = []
    mana = state["mana"]
    hand = hand_cards(state)
    slots = empty_slots(state)

    if not hand:
        return actions

    # Score each card by efficiency: (attack + health + ability_bonus) / cost
    def card_score(c):
        base = c["attack"] + c["health"]
        if c["battle_abilities"]:
            base += 2
        return base / max(c["play_cost"], 1)

    # Sort: worst score first (burn candidates), best score last (play candidates)
    hand_scored = sorted(hand, key=lambda x: card_score(x[1]))

    # Decide which to burn and which to play
    to_burn = []
    to_play = []

    for idx, card in hand_scored:
        if not slots or len(to_play) >= len(slots):
            to_burn.append((idx, card))
        else:
            to_play.append((idx, card))

    # Check if we can afford what we want to play — if not, burn more
    while to_play:
        burn_mana = mana + sum(card_burn(c) for _, c in to_burn)
        burn_mana = min(burn_mana, state["mana_limit"])
        play_cost = sum(card_cost(c) for _, c in to_play)
        if burn_mana >= play_cost:
            break
        # Move cheapest play candidate to burn
        to_play.sort(key=lambda x: card_score(x[1]))
        moved = to_play.pop(0)
        to_burn.append(moved)

    # Execute burns
    sim_mana = mana
    for idx, card in to_burn:
        actions.append({"type": "BurnFromHand", "hand_index": idx})
        sim_mana = min(sim_mana + card_burn(card), state["mana_limit"])

    # Execute plays (most expensive first)
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
    run_agent("Greedy", client, decide, num_games=games, set_id=set_id)
