#!/usr/bin/env python3
"""Aggro Agent — prioritizes high attack units to kill enemies fast.

Strategy: Maximize damage output. Plays highest attack cards.
Aggressively sells low-attack board units to upgrade to bigger hitters.
Prefers OnStart damage abilities to snipe enemies early.
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

    # Score by damage potential
    def aggro_score(c):
        score = c["attack"] * 3 + c["health"]
        for a in c.get("battle_abilities", []):
            effect = a["effect"]
            if effect["type"] == "Damage":
                score += effect.get("amount", 0) * 2
            if effect["type"] == "ModifyStats":
                score += max(effect.get("attack", 0), 0) * 2
            if effect["type"] == "Destroy":
                score += 10  # Instant kill is huge
        return score / max(c["play_cost"], 1)

    # Aggressively sell weak board units (attack <= 2) in later rounds
    if not slots and hand and state["round"] >= 4:
        # Find board units with low attack
        weak_board = [(s, u) for s, u in board if u["attack"] <= 2]
        # Find hand cards better than the weakest
        if weak_board:
            weak_board.sort(key=lambda x: aggro_score(x[1]))
            best_hand = max(hand, key=lambda x: aggro_score(x[1]))
            if aggro_score(best_hand[1]) > aggro_score(weak_board[0][1]) * 1.3:
                weakest_slot = weak_board[0][0]
                actions.append(
                    {"type": "BurnFromBoard", "board_slot": weakest_slot}
                )
                mana = min(mana + card_burn(weak_board[0][1]), state["mana_limit"])
                slots = [weakest_slot]

    if not slots:
        for idx, card in hand:
            actions.append({"type": "BurnFromHand", "hand_index": idx})
        return actions

    # Sort by aggro score
    hand_sorted = sorted(hand, key=lambda x: aggro_score(x[1]))

    to_burn = []
    to_play = []

    for idx, card in hand_sorted:
        if len(to_play) >= len(slots):
            to_burn.append((idx, card))
        else:
            to_play.append((idx, card))

    # Ensure affordability
    while to_play:
        burn_mana = mana + sum(card_burn(c) for _, c in to_burn)
        burn_mana = min(burn_mana, state["mana_limit"])
        play_cost = sum(card_cost(c) for _, c in to_play)
        if burn_mana >= play_cost:
            break
        to_play.sort(key=lambda x: aggro_score(x[1]))
        moved = to_play.pop(0)
        to_burn.append(moved)

    # Burns
    sim_mana = mana
    for idx, card in to_burn:
        actions.append({"type": "BurnFromHand", "hand_index": idx})
        sim_mana = min(sim_mana + card_burn(card), state["mana_limit"])

    # Play highest attack first
    to_play.sort(key=lambda x: x[1]["attack"], reverse=True)
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
    print("=== Aggro Agent on port %d ===" % port)
    run_agent("Aggro", client, decide, num_games=games)
