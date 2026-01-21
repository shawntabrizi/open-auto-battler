# MANALIMIT: Official Game Rules (v1.0)

## 1. Introduction

**Manalimit** is a strategy auto-battler where your deck is your lifeblood. There is no automatic mana regeneration. To summon a powerful army, you must be willing to destroy your own resources.

**Objective:** Win **10 Rounds** to claim victory.
**Failure:** If you lose **3 Lives**, your run ends.

---

## 2. Setup (The Deck)

Before starting a run, you must construct a deck of **60 Unit Cards**.

* **Limit:** Maximum **3 copies** of any unique card.
* **No Sideboard:** All tools you need must be in your main deck.
* **Resource Pool:** Your deck is finite. It serves as both your shop inventory and your mana source.

---

## 3. Card Anatomy

Every Unit Card has four key stats. Two are for economy, two are for combat.

### Economic Stats

* **Play Cost (Blue Gem):** The Mana required to place this unit on the Board.
* **Pitch Value (Red Flame):** The Mana generated if you burn (Pitch) this unit.

### Combat Stats

* **Attack (Sword):** Damage dealt to enemies. Also determines **Initiative** (who reacts first).
* **Health (Heart):** Damage sustained before the unit is defeated.

---

## 4. The Economy

You start every turn with **0 Mana**. You must generate it manually.

### Generating Mana (The Pitch)

To gain Mana, you must **Pitch** a card from your Shop or Board into the **Ash Pile**.

* **Effect:** The card is removed from the game permanently.
* **Gain:** You gain Mana equal to the card's **Pitch Value**.

### The Manalimit (Capacity)

You cannot hoard infinite Mana. Your **Manalimit** determines the maximum Mana you can hold at any one moment. Any Mana generated beyond this limit is evaporated (lost).

* **Round 1:** Limit = 3 Mana
* **Round 2:** Limit = 4 Mana
* **Round 3+:** Limit increases by +1 per Round (Max 10).

> *Strategy Tip: Pitching a high-value card when your tank is full is a waste. Spend your Mana before generating more.*

---

## 5. The Game Loop

The game is played in a series of rounds. Each round has a **Shop Phase** and a **Battle Phase**.

### Phase A: The Shop (Conveyor Belt)

You view the top **7 Cards** of your deck.

**Available Actions:**

1. **PITCH:** Drag a card to the Ash Pile to generate Mana. The belt immediately slides a new card in to replace it.
2. **BUY:** Spend Mana to move a unit from the belt to your **Bench**. This leaves an empty slot on the belt (it does *not* refill immediately).
3. **FREEZE:** Lock a card. It will remain in the shop for the next round.
4. **END TURN:**
* Any unspent Mana is lost.
* All unfrozen cards cycle to the bottom of your deck.
* Combat begins.



> **Warning - Starvation:** Every time you Pitch a card to cycle the shop, you reduce your deck size. If your deck reaches 0 cards, the shop stops refilling.

### Phase B: The Battle (Automated)

Combat resolves automatically against a "Ghost" of a real opponent with a similar Round Number and Win Record.

**1. Triggers & Initiative (The "Speed" Check)**
Before attacks happen, abilities like *"Start of Battle"* or *"On Faint"* may trigger.

* **Rule:** If multiple units trigger at the same time, the unit with the **Highest Attack** goes first.
* **Tie-Breaker:** If Attack is equal, the order is random.
* *Example: A Sniper (6 Atk) will fire its "Start of Battle" shot before a Turtle (2 Atk) can activate its "Start of Battle" shield.*



**2. The Clash (Simultaneous Damage)**

* Units attack from **Front to Back**.
* The front-most units of both teams strike each other **simultaneously**.
* If a unit dies, the next unit behind it steps forward.

**3. Outcome**

* **Victory (+1 Trophy):** You have at least 1 unit alive.
* **Defeat (-1 Life):** Your team is wiped out.
* **Draw (No Change):** Both teams die simultaneously. You do not gain a Trophy, and you do not lose a Life.

---

## 6. Progression Strategy

There is no "Leveling Up" or merging units. Instead, you scale by **Liquidation**.

* **Early Game:** Your Manalimit is low (3). You fill your board with cheap, efficient units (Cost 2).
* **Mid Game:** Your Manalimit is high (8). Your board is full of weak units.
* **The Pivot:** You **Pitch** your own weak units from the board to generate Mana. You combine this with Mana from the shop to buy a massive **Carry Unit** (Cost 8) that was previously unaffordable.

---

## 7. Glossary

| Term | Definition |
| --- | --- |
| **Ash Pile** | The graveyard. Pitched cards go here and are removed from the run. |
| **Pitch** | Sacrificing a card to generate Mana. |
| **Manalimit** | Your Mana Capacity. You cannot hold more Mana than this number. |
| **Starvation** | Running out of cards in your deck. The shop stops refilling. |
| **Initiative** | The order in which abilities resolve. Determined by Attack Power. |
| **Ghost** | A snapshot of a player's board from a previous run. |
