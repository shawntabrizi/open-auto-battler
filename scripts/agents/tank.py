#!/usr/bin/env python3
"""Tank Agent — prioritizes high health units and front-line defense.

Strategy: Build a wall of high-health units. Puts the beefiest unit
at slot 0 (front). Prefers cards with healing or defensive abilities.
Sells low-health units to upgrade.
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

    if not hand:
        return actions

    # Score cards by tankiness: health is king, abilities are bonus
    def tank_score(c):
        score = c["health"] * 2 + c["attack"]
        for a in c.get("battle_abilities", []):
            trigger = a["trigger"]
            effect = a["effect"]["type"]
            # Healing and defensive abilities are highly valued
            if effect == "ModifyStats" and trigger in ("BeforeAnyAttack", "OnStart"):
                score += 5
            if effect == "SpawnUnit" and trigger == "OnFaint":
                score += 3  # Dying and spawning = more bodies
        return score / max(c["play_cost"], 1)

    # If board is full, consider selling weakest unit
    if not slots and hand:
        board_by_health = sorted(board, key=lambda x: x[1]["health"])
        weakest_slot, weakest = board_by_health[0]
        best_hand = max(hand, key=lambda x: tank_score(x[1]))
        if tank_score(best_hand[1]) > tank_score(weakest) * 1.5:
            actions.append({"type": "BurnFromBoard", "board_slot": weakest_slot})
            mana = min(mana + card_burn(weakest), state["mana_limit"])
            slots = [weakest_slot]

    if not slots:
        # Burn all hand cards for mana (might help next round via GainMana abilities)
        for idx, card in hand:
            actions.append({"type": "BurnFromHand", "hand_index": idx})
        return actions

    # Sort hand by tank score (worst first = burn candidates)
    hand_sorted = sorted(hand, key=lambda x: tank_score(x[1]))

    to_burn = []
    to_play = []

    for idx, card in hand_sorted:
        if len(to_play) >= len(slots):
            to_burn.append((idx, card))
        else:
            to_play.append((idx, card))

    # Ensure we can afford
    while to_play:
        burn_mana = mana + sum(card_burn(c) for _, c in to_burn)
        burn_mana = min(burn_mana, state["mana_limit"])
        play_cost = sum(card_cost(c) for _, c in to_play)
        if burn_mana >= play_cost:
            break
        to_play.sort(key=lambda x: tank_score(x[1]))
        moved = to_play.pop(0)
        to_burn.append(moved)

    # Execute burns
    sim_mana = mana
    for idx, card in to_burn:
        actions.append({"type": "BurnFromHand", "hand_index": idx})
        sim_mana = min(sim_mana + card_burn(card), state["mana_limit"])

    # Play tankiest cards, put highest health at front (slot 0 if available)
    to_play.sort(key=lambda x: x[1]["health"], reverse=True)
    for idx, card in to_play:
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
    client = OABClient("http://localhost:%d" % port)
    print("=== Tank Agent on port %d ===" % port)
    run_agent("Tank", client, decide, num_games=games)
