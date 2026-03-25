"""Shared utilities for OAB agent scripts."""

import urllib.request
import urllib.error
import json
import sys
import time


class OABClient:
    """HTTP client for oab-server."""

    def __init__(self, base_url="http://localhost:3000"):
        self.base_url = base_url

    def _post(self, path, data=None):
        body = json.dumps(data).encode() if data else b""
        req = urllib.request.Request(
            self.base_url + path,
            data=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            return json.loads(e.read().decode())

    def _get(self, path):
        req = urllib.request.Request(self.base_url + path)
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())

    def reset(self, seed=None, set_id=None):
        body = {}
        if seed is not None:
            body["seed"] = seed
        if set_id is not None:
            body["set_id"] = set_id
        return self._post("/reset", body if body else None)

    def submit(self, actions):
        return self._post("/submit", {"actions": actions})

    def state(self):
        return self._get("/state")

    def cards(self):
        return self._get("/cards")

    def sets(self):
        return self._get("/sets")


def card_attack(c):
    return c["attack"] if c else 0


def card_health(c):
    return c["health"] if c else 0


def card_cost(c):
    return c["play_cost"] if c else 999


def card_burn(c):
    return c["burn_value"] if c else 0


def has_ability(c, trigger):
    if not c:
        return False
    for a in c.get("battle_abilities", []):
        if a["trigger"] == trigger:
            return True
    return False


def hand_cards(state):
    """Return list of (index, card) for non-None hand slots."""
    return [(i, c) for i, c in enumerate(state["hand"]) if c is not None]


def board_units(state):
    """Return list of (slot, unit) for non-None board slots."""
    return [(i, b) for i, b in enumerate(state["board"]) if b is not None]


def empty_slots(state):
    """Return list of empty board slot indices."""
    return [i for i, b in enumerate(state["board"]) if b is None]


def run_agent(name, client, decide_fn, num_games=100, set_id=0):
    """Run an agent for num_games games and print stats."""
    wins_total = 0
    losses_total = 0
    total_rounds = 0
    max_wins = 0
    win_counts = []  # wins per game

    for game_num in range(1, num_games + 1):
        state = client.reset(set_id=set_id)
        if "error" in state:
            print("  Game %d: reset error: %s" % (game_num, state["error"]))
            time.sleep(2)
            continue

        game_wins = 0
        game_round = 0

        while True:
            game_round = state.get("round", game_round)
            actions = decide_fn(state)
            result = client.submit(actions)

            if "error" in result:
                # Try empty actions on error
                result = client.submit([])
                if "error" in result:
                    break

            game_wins = result["state"]["wins"]
            game_round = result["state"].get("round", game_round)
            total_rounds += 1

            if result["game_over"]:
                outcome = result["game_result"]
                if outcome == "victory":
                    wins_total += 1
                else:
                    losses_total += 1
                print(
                    "  [%s] Game %d: %s — round %d, wins: %d"
                    % (name, game_num, outcome.upper(), game_round, game_wins)
                )
                break

            state = result["state"]

        max_wins = max(max_wins, game_wins)
        win_counts.append(game_wins)

    avg_wins = sum(win_counts) / len(win_counts) if win_counts else 0
    print("\n=== %s Final Results ===" % name)
    print("  Games played: %d" % num_games)
    print("  Full victories (10 wins): %d" % wins_total)
    print("  Defeats: %d" % losses_total)
    print("  Average wins per game: %.2f" % avg_wins)
    print("  Max wins in a single game: %d" % max_wins)
    print("  Total rounds played: %d" % total_rounds)

    return {
        "name": name,
        "games": num_games,
        "victories": wins_total,
        "defeats": losses_total,
        "avg_wins": avg_wins,
        "max_wins": max_wins,
        "total_rounds": total_rounds,
    }
