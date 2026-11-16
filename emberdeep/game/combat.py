"""
combat.py - The rules of a single fight, and the Run that strings fights
together.

IMPORTANT: this file never touches the screen or the controller. It only
tracks numbers (HP, block, cards in hand...) and changes them when asked.
ui.py draws whatever this file says is true. Keeping rules and drawing apart
means we can test the rules by letting a "robot player" play thousands of
fights with no window at all (see tests/simulate.py).
"""

import random

from . import data


class Fighter:
    """Anything that has health and can be hit: the player or an enemy."""

    def __init__(self, name, hp, max_hp):
        self.name = name
        self.hp = hp
        self.max_hp = max_hp
        self.block = 0  # block soaks up damage before HP does
        # How many stacks/turns of each status this fighter has right now.
        self.statuses = {"strength": 0, "weak": 0, "vulnerable": 0}

    @property
    def alive(self):
        return self.hp > 0


def calc_damage(base, attacker, defender):
    """Work out how much damage ONE hit does before block is considered.

    base     - the number printed on the card / enemy move
    attacker - the Fighter doing the hitting
    defender - the Fighter being hit
    """
    dmg = base + attacker.statuses["strength"]      # Strength adds flat damage
    if attacker.statuses["weak"] > 0:
        dmg *= 0.75                                 # Weak: 25% less
    if defender.statuses["vulnerable"] > 0:
        dmg *= 1.5                                  # Vulnerable: 50% more
    return max(0, int(dmg))                         # round down, never negative


class Combat:
    """One fight between the player and a single enemy."""

    def __init__(self, player_hp, player_max_hp, deck, enemy_id, rng=None):
        # rng is the random number generator. Passing our own in (instead of
        # using the global one) lets tests replay the exact same fight.
        self.rng = rng or random.Random()

        self.player = Fighter("You", player_hp, player_max_hp)

        self.enemy_id = enemy_id
        self.enemy_def = data.ENEMIES[enemy_id]       # the enemy's data entry
        self.enemy = Fighter(self.enemy_def["name"], self.enemy_def["hp"], self.enemy_def["hp"])
        self.move_index = 0                           # which move the enemy does next

        # The four card piles. Each is a list of card ids.
        self.draw_pile = list(deck)   # copy, so the fight never edits the real deck
        self.rng.shuffle(self.draw_pile)
        self.hand = []
        self.discard_pile = []
        self.exhaust_pile = []

        self.energy = 0
        self.turn = 0

        # "events" is a to-do list for the screen: things like "the enemy just
        # lost 6 HP" so ui.py can pop up a floating number. The rules never
        # read it; ui.py empties it every frame.
        self.events = []

        self.start_player_turn()

    # ------------------------------------------------------------------
    # Small helpers
    # ------------------------------------------------------------------
    @property
    def result(self):
        """None while the fight is going, otherwise "win" or "lose"."""
        if not self.player.alive:
            return "lose"
        if not self.enemy.alive:
            return "win"
        return None

    def _event(self, target, text, kind):
        """Record something for the screen to show. target: "player"/"enemy"."""
        self.events.append({"target": target, "text": text, "kind": kind})

    def _who(self, fighter):
        """Turn a Fighter object back into the word "player" or "enemy"."""
        return "player" if fighter is self.player else "enemy"

    def _hit(self, attacker, defender, base):
        """Do one hit: block absorbs first, the rest comes off HP."""
        dmg = calc_damage(base, attacker, defender)
        blocked = min(defender.block, dmg)
        defender.block -= blocked
        lost = dmg - blocked
        defender.hp = max(0, defender.hp - lost)
        if lost > 0:
            self._event(self._who(defender), f"-{lost}", "damage")
        else:
            self._event(self._who(defender), "Blocked", "block")

    def _add_status(self, fighter, status, amount):
        fighter.statuses[status] += amount
        self._event(self._who(fighter), f"+{amount} {status.capitalize()}", "status")

    def draw_cards(self, count):
        """Move cards from the draw pile into the hand."""
        for _ in range(count):
            if len(self.hand) >= data.MAX_HAND_SIZE:
                return                          # hand is full: stop drawing
            if not self.draw_pile:
                # Draw pile ran out: shuffle the discard pile into a new one.
                self.draw_pile = self.discard_pile
                self.discard_pile = []
                self.rng.shuffle(self.draw_pile)
            if not self.draw_pile:
                return                          # no cards anywhere: nothing to draw
            self.hand.append(self.draw_pile.pop())

    # ------------------------------------------------------------------
    # The player's turn
    # ------------------------------------------------------------------
    def start_player_turn(self):
        self.turn += 1
        self.player.block = 0                   # block does not carry over
        self.energy = data.ENERGY_PER_TURN
        self.draw_cards(data.CARDS_PER_TURN)

    def can_play(self, hand_index):
        """True if the card at this position in the hand can be played now."""
        if self.result is not None:
            return False
        if not (0 <= hand_index < len(self.hand)):
            return False
        return data.CARDS[self.hand[hand_index]]["cost"] <= self.energy

    def play_card(self, hand_index):
        """Play a card from the hand. Returns True if it was played."""
        if not self.can_play(hand_index):
            return False

        card_id = self.hand.pop(hand_index)     # take it out of the hand first
        card = data.CARDS[card_id]
        self.energy -= card["cost"]

        # Run each step of the card, in order.
        for effect in card["effects"]:
            if not self.enemy.alive:
                break                           # enemy already dead: skip the rest
            self._run_effect(effect)

        # The played card leaves play: exhausted cards are gone for this
        # fight, everything else goes to the discard pile.
        if card.get("exhaust"):
            self.exhaust_pile.append(card_id)
        else:
            self.discard_pile.append(card_id)
        return True

    def _run_effect(self, effect):
        """Carry out one step of a card. See data.py for the list of steps."""
        kind = effect[0]
        p, e = self.player, self.enemy

        if kind == "damage":
            _, amount, times = effect
            for _ in range(times):
                if e.alive:
                    self._hit(p, e, amount)
        elif kind == "damage_from_block":
            self._hit(p, e, p.block)
        elif kind == "damage_bonus_if":
            _, amount, status, bonus = effect
            if e.statuses[status] > 0:
                amount += bonus
            self._hit(p, e, amount)
        elif kind == "block":
            p.block += effect[1]
            self._event("player", f"+{effect[1]} Block", "block")
        elif kind == "apply":
            self._add_status(e, effect[1], effect[2])
        elif kind == "gain":
            self._add_status(p, effect[1], effect[2])
        elif kind == "draw":
            self.draw_cards(effect[1])
        elif kind == "energy":
            self.energy += effect[1]
        elif kind == "lose_hp":
            # Paying HP can never kill you: it stops at 1.
            lost = min(effect[1], p.hp - 1)
            p.hp -= lost
            if lost > 0:
                self._event("player", f"-{lost}", "damage")
        elif kind == "heal":
            healed = min(effect[1], p.max_hp - p.hp)
            p.hp += healed
            self._event("player", f"+{healed} HP", "heal")
        else:
            # A typo in data.py lands here. Crash loudly so it gets noticed
            # instead of the card silently doing nothing.
            raise ValueError(f"Unknown card effect: {effect!r}")

    def end_player_turn(self):
        """Player is done: throw away the hand and tick down their debuffs."""
        self.discard_pile.extend(self.hand)
        self.hand = []
        self._tick_statuses(self.player)

    # ------------------------------------------------------------------
    # The enemy's turn
    # ------------------------------------------------------------------
    def current_move(self):
        """The move the enemy will do on its next turn (its "intent")."""
        moves = self.enemy_def["moves"]
        return moves[self.move_index % len(moves)]   # % makes the list loop

    def intent_text(self):
        """Describe the enemy's next move in words, e.g. ["Attack 7 x2"].

        The attack number already includes Strength, Weak and Vulnerable, so
        what is shown is exactly what will hit you (before your block).
        """
        move = self.current_move()
        parts = []
        if "dmg" in move:
            dmg = calc_damage(move["dmg"], self.enemy, self.player)
            times = move.get("times", 1)
            parts.append(f"Attack {dmg}" + (f" x{times}" if times > 1 else ""))
        if "block" in move:
            parts.append(f"Block {move['block']}")
        if "strength" in move:
            parts.append(f"+{move['strength']} Strength")
        if "weak" in move:
            parts.append(f"Weaken you {move['weak']}")
        if "vulnerable" in move:
            parts.append(f"Expose you {move['vulnerable']}")
        return parts

    def incoming_damage(self):
        """Total damage the enemy's next move would deal (before block)."""
        move = self.current_move()
        if "dmg" not in move:
            return 0
        return calc_damage(move["dmg"], self.enemy, self.player) * move.get("times", 1)

    def enemy_turn(self):
        """The enemy does its move, then the player's next turn begins."""
        if self.result is not None:
            return
        e, p = self.enemy, self.player
        move = self.current_move()
        e.block = 0                              # enemy block lasts one round

        # Order matters: attack first, then debuffs, then self-buffs. That
        # way a Strength gain never changes the attack the player was shown.
        if "dmg" in move:
            for _ in range(move.get("times", 1)):
                if p.alive:
                    self._hit(e, p, move["dmg"])
        if p.alive:
            for status in ("weak", "vulnerable"):
                if status in move:
                    self._add_status(p, status, move[status])
            if "block" in move:
                e.block += move["block"]
                self._event("enemy", f"+{move['block']} Block", "block")
            if "strength" in move:
                self._add_status(e, "strength", move["strength"])

        self.move_index += 1
        self._tick_statuses(e)
        if p.alive:
            self.start_player_turn()

    def _tick_statuses(self, fighter):
        """Weak and Vulnerable wear off by 1 at the end of their owner's turn.
        Strength is permanent for the fight, so it is not touched."""
        for status in ("weak", "vulnerable"):
            if fighter.statuses[status] > 0:
                fighter.statuses[status] -= 1


class Run:
    """One attempt at the whole dungeon: your HP and deck across all floors."""

    def __init__(self, seed=None):
        self.rng = random.Random(seed)   # same seed = same run, handy for testing
        self.max_hp = data.PLAYER_MAX_HP
        self.hp = self.max_hp
        self.deck = list(data.STARTER_DECK)
        self.floor = 0                   # index into data.FLOORS (0 = first floor)

    @property
    def floor_info(self):
        return data.FLOORS[self.floor]

    @property
    def finished(self):
        """True once the last floor has been cleared."""
        return self.floor >= len(data.FLOORS)

    def start_combat(self):
        """Build the fight for the current floor."""
        enemy_id = self.rng.choice(self.floor_info["enemies"])
        return Combat(self.hp, self.max_hp, self.deck, enemy_id, self.rng)

    def finish_combat(self, combat):
        """Carry the HP you ended the fight with into the rest of the run."""
        self.hp = combat.player.hp

    def reward_choices(self, count=3):
        """Pick `count` different cards to offer after a fight."""
        return self.rng.sample(data.REWARD_POOL, count)

    def rest_heal(self):
        amount = int(self.max_hp * data.REST_HEAL_FRACTION)
        self.hp = min(self.max_hp, self.hp + amount)

    def rest_fortify(self):
        self.max_hp += data.REST_FORTIFY_HP
        self.hp += data.REST_FORTIFY_HP

    def next_floor(self):
        self.floor += 1
