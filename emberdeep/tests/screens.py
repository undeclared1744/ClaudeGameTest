"""
screens.py - Drive the real game with fake button presses (no screen needed)
and save a picture of each screen into tests/shots/ so layouts can be checked.

    python3 tests/screens.py
"""
import os
import sys

os.environ["SDL_VIDEODRIVER"] = "dummy"     # pretend display
os.environ["SDL_AUDIODRIVER"] = "dummy"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import random
import pygame
from game import data
from game.ui import App

random.seed(1)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots")
os.makedirs(out, exist_ok=True)
app = App(headless=True)


def shot(name):
    app.update(0.016)
    app.draw()
    pygame.image.save(app.canvas, os.path.join(out, name + ".png"))


def press(*actions):
    for a in actions:
        app.handle_action(a)


def wait(seconds):
    for _ in range(int(seconds * 60)):
        app.update(1 / 60)


shot("01_title")
press("down", "confirm"); shot("02_howto"); press("confirm", "up")

# --- fake controller events go through the same path real ones do ---
ev = pygame.event.Event(pygame.CONTROLLERBUTTONDOWN, button=pygame.CONTROLLER_BUTTON_DPAD_DOWN, instance_id=0)
assert app.translate_event(ev) == "down"
ev = pygame.event.Event(pygame.CONTROLLERBUTTONDOWN, button=pygame.CONTROLLER_BUTTON_A, instance_id=0)
assert app.translate_event(ev) == "confirm"
ev = pygame.event.Event(pygame.CONTROLLERAXISMOTION, axis=pygame.CONTROLLER_AXIS_LEFTX, value=32000, instance_id=0)
assert app.translate_event(ev) == "right"
assert app.translate_event(ev) is None, "holding the stick must not repeat"
ev = pygame.event.Event(pygame.CONTROLLERAXISMOTION, axis=pygame.CONTROLLER_AXIS_LEFTX, value=0, instance_id=0)
assert app.translate_event(ev) is None
ev = pygame.event.Event(pygame.JOYHATMOTION, value=(-1, 0), instance_id=5, hat=0)
assert app.translate_event(ev) == "left"

press("confirm")                      # New Run
assert app.state == "combat"
shot("03_combat_start")
press("right", "right", "confirm"); wait(0.3); shot("04_combat_after_card")
press("deck"); shot("05_deck"); press("cancel")
press("menu"); shot("06_pause"); press("cancel")

# touch: tap a card twice = select then play
app.draw()
rect = [z for z in app.click_zones if z[0].y > 480 and z[0].w == 160][0][0]
before = len(app.combat.hand)
app.handle_click(rect.center); app.draw()
target = app.sel
rect = [z[0] for z in app.click_zones if z[0].w == 160 and z[0].y < 520][0]
app.handle_click(rect.center)
assert len(app.combat.hand) in (before, before - 1)

# Worst-case hand: 10 cards with the longest text, plus every status at once.
app.combat.hand = ["exploit", "quick_thinking", "bloodletting", "adrenaline", "shield_bash",
                   "second_wind", "heavy_swing", "crush", "war_cry", "expose"]
app.combat.energy = 1
app.combat.player.block = 12
for f in (app.combat.player, app.combat.enemy):
    f.statuses.update(strength=2, weak=2, vulnerable=2)
app.sel = 4
shot("07_combat_full_hand")
app.combat.hand = ["strike", "defend"]
for f in (app.combat.player, app.combat.enemy):
    f.statuses.update(strength=0, weak=0, vulnerable=0)

# Play whole runs with random buttons until we have seen every screen.
seen = set()
shots_taken = set()
enemies_seen = set()
for attempt in range(400):
    steps = 0
    while app.state not in ("win", "lose"):
        steps += 1
        assert steps < 20000, "run never ended"
        if app.state == "combat":
            eid = app.combat.enemy_id
            if eid not in enemies_seen and app.phase == "player":
                enemies_seen.add(eid); shot("enemy_" + eid)
            if app.phase != "player":
                wait(0.2)
                continue
            if attempt >= 15 and "win" not in seen:
                # The button-masher rarely beats the boss, so after a while
                # weaken enemies to make sure the victory screen gets tested.
                app.combat.enemy.hp = min(app.combat.enemy.hp, 3)
            playable = [i for i in range(len(app.combat.hand)) if app.combat.can_play(i)]
            if playable and random.random() < 0.9:
                app.sel = random.choice(playable)
                # a smarter-than-random pick so some runs reach the boss
                for i in playable:
                    card = data.CARDS[app.combat.hand[i]]
                    blocks = any(e[0] == "block" for e in card["effects"])
                    if blocks == (app.combat.incoming_damage() > app.combat.player.block):
                        app.sel = i
                press("confirm")
            else:
                press("end_turn")
        elif app.state == "reward":
            if "reward" not in shots_taken:
                shots_taken.add("reward"); shot("08_reward")
            press(random.choice(["left", "right", "down", "up", "confirm", "confirm"]))
        elif app.state == "rest":
            if "rest" not in shots_taken:
                shots_taken.add("rest"); shot("09_rest")
            press(random.choice(["left", "right", "confirm"]))
        # random noise: overlays and useless buttons must never break anything
        if random.random() < 0.02:
            press(random.choice(["deck", "menu", "cancel", "up", "down"]))
            press("cancel")
        seen.add(app.state)
    seen.add(app.state)
    if app.state not in shots_taken:
        shots_taken.add(app.state); shot("10_" + app.state)
    press("confirm")
    assert app.state == "title"
    press("confirm")
    if {"win", "lose"} <= seen and len(enemies_seen) == len(data.ENEMIES):
        break

print("screens seen:", sorted(seen))
print("enemies drawn:", len(enemies_seen), "of", len(data.ENEMIES))
print("runs played:", attempt + 1)
assert {"combat", "reward", "rest", "win", "lose"} <= seen
print("OK")
