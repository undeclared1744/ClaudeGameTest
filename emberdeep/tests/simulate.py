"""
simulate.py - Let a simple robot play many full runs with no window.

Why: it proves the rules never crash (every card and enemy gets used
thousands of times) and gives a rough feel for difficulty.

Run it from the emberdeep folder:   python3 tests/simulate.py
"""
import os
import sys

# Let Python find the "game" package when this file is run directly.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game import data
from game.combat import Run


def bot_take_turn(combat):
    """A plain, not-very-clever player: block when a hit is coming, else attack."""
    safety = 0
    while combat.result is None:
        safety += 1
        assert safety < 200, "a single turn should never take 200 card plays"
        playable = [i for i in range(len(combat.hand)) if combat.can_play(i)]
        if not playable:
            break
        need_block = combat.incoming_damage() > combat.player.block

        def score(i):
            card = data.CARDS[combat.hand[i]]
            gives_block = any(e[0] == "block" for e in card["effects"])
            if card["cost"] == 0 and combat.hand[i] != "bloodletting":
                return 3                      # free cards first
            if need_block and gives_block:
                return 2
            if card["type"] == "attack":
                return 1
            return 0 if not gives_block else -1   # don't waste block when safe
        best = max(playable, key=score)
        if score(best) < 0:
            break
        combat.play_card(best)
    if combat.result is None:
        combat.end_player_turn()
        combat.enemy_turn()


def play_run(seed):
    """Play one whole run. Returns (won, floor_reached, hp_left)."""
    run = Run(seed)
    while not run.finished:
        floor = run.floor_info
        if floor["type"] == "rest":
            # Heal if hurt, otherwise take the max HP.
            if run.hp < run.max_hp * 0.7:
                run.rest_heal()
            else:
                run.rest_fortify()
        else:
            combat = run.start_combat()
            turns = 0
            while combat.result is None:
                bot_take_turn(combat)
                turns += 1
                assert turns < 300, "fight went on forever"
            # Sanity checks: numbers must always stay in a legal range.
            assert 0 <= combat.player.hp <= combat.player.max_hp
            total = len(combat.hand) + len(combat.draw_pile) + len(combat.discard_pile) + len(combat.exhaust_pile)
            assert total == len(run.deck), "a card was lost or duplicated"
            if combat.result == "lose":
                return False, run.floor + 1, 0
            run.finish_combat(combat)
            if floor["type"] != "boss":
                # Take a random reward card (so every card gets exercised).
                run.deck.append(run.rng.choice(run.reward_choices()))
        run.next_floor()
    return True, len(data.FLOORS), run.hp


if __name__ == "__main__":
    runs = 3000
    wins = 0
    died_on = {}
    for seed in range(runs):
        won, floor, hp = play_run(seed)
        wins += won
        if not won:
            died_on[floor] = died_on.get(floor, 0) + 1
    print(f"{runs} runs, no crashes. Robot win rate: {wins / runs:.0%}")
    print("Deaths by floor:", dict(sorted(died_on.items())))
