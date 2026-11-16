"""
data.py - All the "content" of the game: cards, enemies, and the run layout.

Nothing in this file DOES anything. It is just plain data (dictionaries and
lists) that the rest of the game reads. That is on purpose: if you want to
add a card, tweak an enemy, or rebalance numbers, this is the only file you
need to touch.
"""

# ---------------------------------------------------------------------------
# CARDS
# ---------------------------------------------------------------------------
# Every card is a dictionary with these keys:
#   name    - what is printed on the card
#   cost    - how much energy it takes to play
#   type    - "attack" or "skill" (only changes the card's color)
#   text    - rules text printed on the card (for the human)
#   effects - what the card actually does (for the computer). It is a list of
#             small steps that run in order. Each step is a tuple whose first
#             item is the step name. combat.py knows how to run each one:
#
#               ("damage", amount, times)   hit the enemy `times` times
#               ("block", amount)           gain block
#               ("apply", status, amount)   put a status on the ENEMY
#               ("gain", status, amount)    put a status on YOURSELF
#               ("draw", count)             draw cards
#               ("energy", amount)          gain energy this turn
#               ("lose_hp", amount)         pay HP (can never drop you below 1)
#               ("heal", amount)            restore HP
#               ("damage_from_block",)      hit for however much block you have
#               ("damage_bonus_if", amount, status, bonus)
#                                           hit for `amount`, or amount+bonus
#                                           if the enemy has `status`
#   exhaust - if True the card is removed for the rest of the fight after it
#             is played (it comes back next fight)
#
# The dictionary KEY (like "strike") is the card's id. Decks are just lists of
# these ids, e.g. ["strike", "strike", "defend"].

CARDS = {
    # ----- starter cards -----
    "strike": {
        "name": "Strike", "cost": 1, "type": "attack",
        "text": "Deal 6 damage.",
        "effects": [("damage", 6, 1)],
    },
    "defend": {
        "name": "Defend", "cost": 1, "type": "skill",
        "text": "Gain 5 Block.",
        "effects": [("block", 5)],
    },
    "crush": {
        "name": "Crush", "cost": 2, "type": "attack",
        "text": "Deal 8 damage. Apply 2 Vulnerable.",
        "effects": [("damage", 8, 1), ("apply", "vulnerable", 2)],
    },

    # ----- cards you can find as rewards -----
    "heavy_swing": {
        "name": "Heavy Swing", "cost": 2, "type": "attack",
        "text": "Deal 14 damage.",
        "effects": [("damage", 14, 1)],
    },
    "twin_slash": {
        "name": "Twin Slash", "cost": 1, "type": "attack",
        "text": "Deal 4 damage twice.",
        "effects": [("damage", 4, 2)],
    },
    "flurry": {
        "name": "Flurry", "cost": 1, "type": "attack",
        "text": "Deal 2 damage three times.",
        "effects": [("damage", 2, 3)],
    },
    "cripple": {
        "name": "Cripple", "cost": 1, "type": "attack",
        "text": "Deal 5 damage. Apply 2 Weak.",
        "effects": [("damage", 5, 1), ("apply", "weak", 2)],
    },
    "exploit": {
        "name": "Exploit", "cost": 1, "type": "attack",
        "text": "Deal 7 damage. Deal 12 instead if the enemy is Vulnerable.",
        "effects": [("damage_bonus_if", 7, "vulnerable", 5)],
    },
    "shield_bash": {
        "name": "Shield Bash", "cost": 1, "type": "attack",
        "text": "Deal damage equal to your Block.",
        "effects": [("damage_from_block",)],
    },
    "iron_wall": {
        "name": "Iron Wall", "cost": 2, "type": "skill",
        "text": "Gain 12 Block.",
        "effects": [("block", 12)],
    },
    "bulwark": {
        "name": "Bulwark", "cost": 1, "type": "skill",
        "text": "Gain 8 Block.",
        "effects": [("block", 8)],
    },
    "second_wind": {
        "name": "Second Wind", "cost": 1, "type": "skill",
        "text": "Gain 4 Block. Draw 1 card.",
        "effects": [("block", 4), ("draw", 1)],
    },
    "quick_thinking": {
        "name": "Quick Thinking", "cost": 0, "type": "skill",
        "text": "Draw 2 cards.",
        "effects": [("draw", 2)],
    },
    "war_cry": {
        "name": "War Cry", "cost": 1, "type": "skill",
        "text": "Gain 2 Strength. Exhaust.",
        "effects": [("gain", "strength", 2)],
        "exhaust": True,
    },
    "expose": {
        "name": "Expose", "cost": 0, "type": "skill",
        "text": "Apply 2 Vulnerable. Exhaust.",
        "effects": [("apply", "vulnerable", 2)],
        "exhaust": True,
    },
    "bloodletting": {
        "name": "Bloodletting", "cost": 0, "type": "skill",
        "text": "Lose 3 HP. Gain 2 Energy.",
        "effects": [("lose_hp", 3), ("energy", 2)],
    },
    "adrenaline": {
        "name": "Adrenaline", "cost": 0, "type": "skill",
        "text": "Gain 1 Energy. Draw 1 card. Exhaust.",
        "effects": [("energy", 1), ("draw", 1)],
        "exhaust": True,
    },
    "mend": {
        "name": "Mend", "cost": 1, "type": "skill",
        "text": "Heal 6 HP. Exhaust.",
        "effects": [("heal", 6)],
        "exhaust": True,
    },
}

# The deck every run starts with: 5 Strikes, 4 Defends, 1 Crush.
STARTER_DECK = ["strike"] * 5 + ["defend"] * 4 + ["crush"]

# Cards that can show up as a reward after a fight: everything except the
# two basic starter cards.
REWARD_POOL = [cid for cid in CARDS if cid not in ("strike", "defend")]


# ---------------------------------------------------------------------------
# STATUSES
# ---------------------------------------------------------------------------
# Short explanations shown in the game so the player does not need a manual.
STATUS_INFO = {
    "strength":   "Strength: each hit deals that much extra damage.",
    "weak":       "Weak: attacks deal 25% less damage.",
    "vulnerable": "Vulnerable: takes 50% more damage from attacks.",
}


# ---------------------------------------------------------------------------
# ENEMIES
# ---------------------------------------------------------------------------
# Every enemy has:
#   name   - shown above it
#   hp     - starting health
#   color  - (red, green, blue) body color, each 0-255
#   shape  - which simple drawing to use: "blob", "beast", "brute", "ghost",
#            or "dragon" (see draw_enemy in ui.py)
#   moves  - what it does each turn. It walks through this list in order and
#            starts over at the end, so enemies are predictable on purpose:
#            learning the pattern is part of the game.
#
# A move is a dictionary. It can combine any of these keys:
#   dmg, times        - attack for `dmg`, `times` times (times defaults to 1)
#   block             - the enemy gains block
#   strength          - the enemy gains Strength (permanent for the fight)
#   weak, vulnerable  - put that many turns of the status on the player

ENEMIES = {
    # ----- easy (floors 1-2) -----
    "cave_rat": {
        "name": "Cave Rat", "hp": 22, "color": (150, 120, 95), "shape": "beast",
        "moves": [{"dmg": 5}, {"dmg": 5}, {"dmg": 8}],
    },
    "ember_slime": {
        "name": "Ember Slime", "hp": 28, "color": (225, 120, 50), "shape": "blob",
        "moves": [{"dmg": 6}, {"block": 6, "weak": 1}, {"dmg": 9}],
    },
    # ----- medium (floors 3-5) -----
    "tunnel_bandit": {
        "name": "Tunnel Bandit", "hp": 36, "color": (110, 135, 95), "shape": "brute",
        "moves": [{"dmg": 9}, {"strength": 2, "block": 5}, {"dmg": 7}, {"dmg": 4, "times": 2}],
    },
    "ash_wraith": {
        "name": "Ash Wraith", "hp": 34, "color": (150, 150, 185), "shape": "ghost",
        "moves": [{"weak": 2}, {"dmg": 10}, {"dmg": 6, "vulnerable": 2}, {"dmg": 8}],
    },
    # ----- hard (floor 7) -----
    "stone_golem": {
        "name": "Stone Golem", "hp": 52, "color": (125, 125, 135), "shape": "brute",
        "moves": [{"block": 12}, {"dmg": 15}, {"dmg": 6, "times": 2}],
    },
    "cinder_hound": {
        "name": "Cinder Hound", "hp": 46, "color": (195, 75, 55), "shape": "beast",
        "moves": [{"dmg": 5, "times": 2}, {"dmg": 11}, {"strength": 2}, {"dmg": 4, "times": 3}],
    },
    # ----- elite (floor 6) -----
    "ogre": {
        "name": "Forge Ogre", "hp": 64, "color": (95, 150, 125), "shape": "brute",
        "moves": [{"strength": 2, "block": 8}, {"dmg": 14}, {"dmg": 7, "vulnerable": 1}, {"dmg": 6, "times": 2}],
    },
    # ----- boss (floor 9) -----
    "ember_wyrm": {
        "name": "The Ember Wyrm", "hp": 105, "color": (215, 60, 45), "shape": "dragon",
        "moves": [
            {"dmg": 10},
            {"strength": 2, "block": 12},
            {"dmg": 4, "times": 3},
            {"dmg": 8, "vulnerable": 2},
            {"dmg": 16},
        ],
    },
}


# ---------------------------------------------------------------------------
# THE RUN
# ---------------------------------------------------------------------------
# A run is a straight line of floors. Each entry says what kind of floor it is
# and, for fights, which enemies might appear (one is picked at random).
#   "fight" / "elite" / "boss" - a battle
#   "rest"                     - a campfire: heal or toughen up
FLOORS = [
    {"type": "fight", "enemies": ["cave_rat", "ember_slime"]},
    {"type": "fight", "enemies": ["cave_rat", "ember_slime"]},
    {"type": "fight", "enemies": ["tunnel_bandit", "ash_wraith"]},
    {"type": "rest"},
    {"type": "fight", "enemies": ["tunnel_bandit", "ash_wraith"]},
    {"type": "elite", "enemies": ["ogre"]},
    {"type": "fight", "enemies": ["stone_golem", "cinder_hound"]},
    {"type": "rest"},
    {"type": "boss",  "enemies": ["ember_wyrm"]},
]

# Player numbers, gathered in one place so they are easy to tune.
PLAYER_MAX_HP = 70        # health at the start of a run
ENERGY_PER_TURN = 3       # energy refilled at the start of each turn
CARDS_PER_TURN = 5        # cards drawn at the start of each turn
MAX_HAND_SIZE = 10        # extra draws past this are skipped
REST_HEAL_FRACTION = 0.30 # "Rest" heals this share of max HP
REST_FORTIFY_HP = 7       # "Toughen Up" adds this much max HP (and heals it)
