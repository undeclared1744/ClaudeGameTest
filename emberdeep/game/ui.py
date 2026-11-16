"""
ui.py - Everything you see and touch: the window, drawing, and input.

How it is organised:
  * App.run() is the main loop. About 60 times a second it does three things:
      1. read input (controller / keyboard / touch) and turn it into simple
         "actions" like "left" or "confirm"
      2. update timers (floating numbers, the pause before the enemy acts)
      3. draw the current screen
  * self.state says which screen we are on: "title", "howto", "combat",
    "reward", "rest", "win" or "lose".
  * The actual game rules live in combat.py. This file only asks the rules to
    do things (play a card, end the turn) and then draws the result.

The game is always drawn on a fixed 1280x800 "canvas" (the Steam Deck's
screen size) and then stretched to fit whatever window it is really in, so
the layout numbers below never have to change.
"""

import math
import random
import sys

import pygame

from . import data
from .combat import Run

# pygame's game-controller module gives every pad the same button numbers
# (A is always A) no matter the brand. It lives in a private module, so we
# import it carefully and fall back to plain joystick handling without it.
try:
    from pygame._sdl2 import controller as sdl_controller
except Exception:  # pragma: no cover - only on unusual pygame builds
    sdl_controller = None

# ---------------------------------------------------------------------------
# Layout and colors
# ---------------------------------------------------------------------------
W, H = 1280, 800                 # size of the canvas we draw on
CARD_W, CARD_H = 160, 224        # size of a card in the hand

# Colors are (red, green, blue), each 0-255.
BG = (24, 20, 28)
PANEL = (42, 36, 48)
PANEL_LIGHT = (64, 56, 72)
TEXT = (236, 230, 220)
MUTED = (150, 142, 150)
EMBER = (255, 150, 60)
RED = (220, 70, 60)
GREEN = (95, 200, 120)
BLUE = (90, 150, 230)
GOLD = (245, 205, 95)
CARD_COLORS = {"attack": (150, 58, 52), "skill": (52, 92, 150)}
STATUS_COLORS = {"strength": (240, 140, 60), "weak": (150, 190, 110), "vulnerable": (200, 110, 220)}
FLOAT_COLORS = {"damage": RED, "block": BLUE, "status": GOLD, "heal": GREEN}

# Where the two fighters stand on the canvas (center points).
PLAYER_POS = (330, 290)
ENEMY_POS = (940, 280)

# Letters shown on the floor tracker at the top of the screen.
FLOOR_LETTERS = {"fight": "F", "elite": "E", "rest": "R", "boss": "B"}


class App:
    def __init__(self, windowed=False, headless=False):
        """windowed: run in a normal window instead of fullscreen.
        headless: no real screen at all (used by the automated tests)."""
        pygame.init()
        pygame.display.set_caption("Emberdeep")
        if headless:
            self.window = pygame.display.set_mode((W, H))
        elif windowed:
            self.window = pygame.display.set_mode((W, H), pygame.RESIZABLE)
        else:
            # (0, 0) means "use the screen's own resolution".
            self.window = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
            pygame.mouse.set_visible(False)   # hidden until the mouse/touch is used
        self.canvas = pygame.Surface((W, H))
        self.clock = pygame.time.Clock()
        self.fonts = {}             # cache of loaded font sizes (see font())
        self.running = True

        # --- controllers ---
        self.controllers = []       # opened pads (must be kept or they close)
        self.controller_ids = set() # ids of pads handled by the controller module
        self.joysticks = []         # pads that only work as a plain joystick
        self.stick_dir = (0, 0)     # last direction the left stick pointed
        self.stick_raw = [0.0, 0.0] # latest left-stick position (x, y), each -1..1
        self.last_device = "pad"    # "pad" or "keys": decides which hints to show
        if sdl_controller is not None:
            sdl_controller.init()
        self.scan_controllers()

        # --- game state ---
        self.state = "title"
        self.menu_index = 0         # highlighted option on menu-style screens
        self.run_state = None       # the current Run (None on the title screen)
        self.combat = None          # the current Combat (None outside fights)
        self.phase = "player"       # in a fight: "player", "enemy" or "ending"
        self.timer = 0.0            # countdown used by the "enemy"/"ending" phases
        self.sel = 0                # which card in the hand is highlighted
        self.reward_cards = []      # the cards offered on the reward screen
        self.show_deck = False      # is the deck overlay open?
        self.paused = False         # is the "abandon run?" box open?
        self.pause_index = 0
        self.floats = []            # floating numbers currently on screen
        self.shake = {"player": 0.0, "enemy": 0.0}   # seconds left of hit-shake
        self.toast = ""             # short message like "Not enough energy"
        self.toast_time = 0.0
        self.time = 0.0             # total seconds running (drives idle bobbing)
        self.click_zones = []       # (rect, function) pairs for mouse/touch

    # ------------------------------------------------------------------
    # Controllers
    # ------------------------------------------------------------------
    def scan_controllers(self):
        """Open every connected pad. Called at start and when one is plugged in."""
        self.controllers, self.controller_ids, self.joysticks = [], set(), []
        for i in range(pygame.joystick.get_count()):
            try:
                if sdl_controller is not None and sdl_controller.is_controller(i):
                    pad = sdl_controller.Controller(i)
                    self.controllers.append(pad)
                    self.controller_ids.add(pad.as_joystick().get_instance_id())
                else:
                    self.joysticks.append(pygame.joystick.Joystick(i))
            except pygame.error:
                pass    # a pad that fails to open is simply ignored

    # ------------------------------------------------------------------
    # Input: turn raw events into simple action names
    # ------------------------------------------------------------------
    KEY_ACTIONS = {
        pygame.K_LEFT: "left", pygame.K_a: "left",
        pygame.K_RIGHT: "right", pygame.K_d: "right",
        pygame.K_UP: "up", pygame.K_w: "up",
        pygame.K_DOWN: "down", pygame.K_s: "down",
        pygame.K_RETURN: "confirm", pygame.K_SPACE: "confirm",
        pygame.K_BACKSPACE: "cancel",
        pygame.K_e: "end_turn",
        pygame.K_TAB: "deck",
        pygame.K_ESCAPE: "menu",
    }
    PAD_ACTIONS = {
        pygame.CONTROLLER_BUTTON_A: "confirm",
        pygame.CONTROLLER_BUTTON_B: "cancel",
        pygame.CONTROLLER_BUTTON_X: "deck",
        pygame.CONTROLLER_BUTTON_Y: "end_turn",
        pygame.CONTROLLER_BUTTON_START: "menu",
        pygame.CONTROLLER_BUTTON_DPAD_LEFT: "left",
        pygame.CONTROLLER_BUTTON_DPAD_RIGHT: "right",
        pygame.CONTROLLER_BUTTON_DPAD_UP: "up",
        pygame.CONTROLLER_BUTTON_DPAD_DOWN: "down",
    }
    # Fallback numbers for pads that only show up as a plain joystick
    # (the usual Xbox-style layout on Linux).
    JOY_ACTIONS = {0: "confirm", 1: "cancel", 2: "deck", 3: "end_turn", 7: "menu"}

    def stick_action(self, x, y):
        """Turn a stick position (-1..1 on each axis) into at most one action.

        It only fires at the moment the stick is pushed past the threshold,
        so holding the stick over moves the selection once, not 60x a second.
        """
        threshold = 0.6
        dx = (x > threshold) - (x < -threshold)     # becomes -1, 0 or 1
        dy = (y > threshold) - (y < -threshold)
        action = None
        if (dx, dy) != self.stick_dir:
            if dx != 0 and dx != self.stick_dir[0]:
                action = "right" if dx > 0 else "left"
            elif dy != 0 and dy != self.stick_dir[1]:
                action = "down" if dy > 0 else "up"
        self.stick_dir = (dx, dy)
        return action

    def translate_event(self, event):
        """Return the action name for one pygame event, or None."""
        if event.type == pygame.KEYDOWN:
            self.last_device = "keys"
            if event.key == pygame.K_F11:
                pygame.display.toggle_fullscreen()
            return self.KEY_ACTIONS.get(event.key)

        if event.type == pygame.CONTROLLERBUTTONDOWN:
            self.last_device = "pad"
            return self.PAD_ACTIONS.get(event.button)

        if event.type == pygame.CONTROLLERAXISMOTION:
            # Stick values arrive as -32768..32767; scale to -1..1.
            if event.axis == pygame.CONTROLLER_AXIS_LEFTX:
                return self._axis(event.value / 32767.0, None)
            if event.axis == pygame.CONTROLLER_AXIS_LEFTY:
                return self._axis(None, event.value / 32767.0)
            return None

        # ---- plain-joystick fallback (skipped for pads handled above) ----
        if event.type in (pygame.JOYBUTTONDOWN, pygame.JOYHATMOTION, pygame.JOYAXISMOTION):
            if event.instance_id in self.controller_ids:
                return None
            self.last_device = "pad"
            if event.type == pygame.JOYBUTTONDOWN:
                return self.JOY_ACTIONS.get(event.button)
            if event.type == pygame.JOYHATMOTION:       # the d-pad
                hx, hy = event.value
                if hx:
                    return "right" if hx > 0 else "left"
                if hy:
                    return "up" if hy > 0 else "down"
                return None
            if event.axis == 0:
                return self._axis(event.value, None)
            if event.axis == 1:
                return self._axis(None, event.value)
        return None

    def _axis(self, x, y):
        """Remember each stick axis separately, then ask stick_action()."""
        if x is not None:
            self.stick_raw[0] = x
        if y is not None:
            self.stick_raw[1] = y
        action = self.stick_action(*self.stick_raw)
        if action:
            self.last_device = "pad"
        return action

    def window_to_canvas(self, pos):
        """Convert a mouse/touch position in the real window to canvas coords."""
        scale, ox, oy = self.fit()
        return ((pos[0] - ox) / scale, (pos[1] - oy) / scale)

    def fit(self):
        """How to place the 1280x800 canvas inside the real window:
        returns (scale, x_offset, y_offset), keeping the shape undistorted."""
        ww, wh = self.window.get_size()
        scale = min(ww / W, wh / H)
        return scale, (ww - W * scale) / 2, (wh - H * scale) / 2

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            elif event.type in (pygame.JOYDEVICEADDED, pygame.JOYDEVICEREMOVED):
                self.scan_controllers()
            elif event.type == pygame.MOUSEMOTION:
                pygame.mouse.set_visible(True)
            elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                self.last_device = "keys"
                self.handle_click(self.window_to_canvas(event.pos))
            else:
                action = self.translate_event(event)
                if action:
                    self.handle_action(action)

    def handle_click(self, pos):
        """Mouse click or screen tap: run the topmost zone under the pointer."""
        # Zones are stored in drawing order, so the last one is on top.
        for rect, func in reversed(self.click_zones):
            if rect.collidepoint(pos):
                func()
                return

    # ------------------------------------------------------------------
    # Actions: what each button does on each screen
    # ------------------------------------------------------------------
    def handle_action(self, action):
        # Overlays get first say, then the screen underneath.
        if self.paused:
            return self.action_pause(action)
        if self.show_deck:
            if action in ("cancel", "deck", "confirm", "menu"):
                self.show_deck = False
            return
        if action == "menu" and self.run_state is not None:
            self.paused, self.pause_index = True, 0
            return
        if action == "deck" and self.run_state is not None:
            self.show_deck = True
            return
        handler = getattr(self, "action_" + self.state)
        handler(action)

    def move_index(self, index, count, action, back="left", forward="right"):
        """Shared helper: move a highlighted index and wrap around the ends."""
        if count <= 0:
            return 0
        if action == back:
            return (index - 1) % count
        if action == forward:
            return (index + 1) % count
        return index

    def action_title(self, action):
        self.menu_index = self.move_index(self.menu_index, 3, action, "up", "down")
        if action == "confirm":
            self.title_choose(self.menu_index)
        elif action == "menu":
            self.running = False

    def title_choose(self, index):
        if index == 0:
            self.new_run()
        elif index == 1:
            self.state = "howto"
        else:
            self.running = False

    def action_howto(self, action):
        if action in ("confirm", "cancel", "menu"):
            self.state = "title"

    def action_pause(self, action):
        self.pause_index = self.move_index(self.pause_index, 2, action, "up", "down")
        if action in ("cancel", "menu"):
            self.paused = False
        elif action == "confirm":
            self.pause_choose(self.pause_index)

    def pause_choose(self, index):
        self.paused = False
        if index == 1:              # "Abandon run"
            self.to_title()

    def to_title(self):
        self.state, self.menu_index = "title", 0
        self.run_state = self.combat = None
        self.show_deck = self.paused = False
        self.floats = []

    def action_combat(self, action):
        if self.phase != "player":
            return                  # no input while the enemy is acting
        hand = self.combat.hand
        self.sel = self.move_index(self.sel, len(hand), action)
        if action == "confirm":
            self.play_selected()
        elif action == "end_turn":
            self.end_turn()

    def action_reward(self, action):
        # Options 0-2 are the cards, option 3 is "Skip" underneath them.
        if action in ("left", "right") and self.menu_index < 3:
            self.menu_index = self.move_index(self.menu_index, 3, action)
        elif action == "down":
            self.menu_index = 3
        elif action == "up" and self.menu_index == 3:
            self.menu_index = 1
        elif action == "confirm":
            self.reward_choose(self.menu_index)

    def reward_choose(self, index):
        if index < 3:
            self.run_state.deck.append(self.reward_cards[index])
        self.advance()

    def action_rest(self, action):
        self.menu_index = self.move_index(self.menu_index, 2, action)
        if action == "confirm":
            self.rest_choose(self.menu_index)

    def rest_choose(self, index):
        if index == 0:
            self.run_state.rest_heal()
        else:
            self.run_state.rest_fortify()
        self.advance()

    def action_win(self, action):
        if action in ("confirm", "cancel"):
            self.to_title()

    action_lose = action_win      # same behaviour on the defeat screen

    # ------------------------------------------------------------------
    # Moving through a run
    # ------------------------------------------------------------------
    def new_run(self):
        self.run_state = Run()
        self.enter_floor()

    def enter_floor(self):
        """Set up whatever the current floor is."""
        self.menu_index = 0
        self.floats = []
        if self.run_state.floor_info["type"] == "rest":
            self.combat = None
            self.state = "rest"
        else:
            self.combat = self.run_state.start_combat()
            self.phase, self.sel = "player", 0
            self.state = "combat"
            self.collect_events()

    def advance(self):
        """Go to the next floor (or the victory screen after the last one)."""
        self.run_state.next_floor()
        if self.run_state.finished:
            self.state = "win"
        else:
            self.enter_floor()

    # ------------------------------------------------------------------
    # Fight flow
    # ------------------------------------------------------------------
    def play_selected(self):
        combat = self.combat
        if not combat.hand:
            return
        if not combat.can_play(self.sel):
            self.show_toast("Not enough energy")
            return
        combat.play_card(self.sel)
        self.sel = max(0, min(self.sel, len(combat.hand) - 1))   # keep in range
        self.collect_events()
        self.check_fight_over()

    def end_turn(self):
        self.combat.end_player_turn()
        self.phase, self.timer = "enemy", 0.6     # short beat before the enemy acts

    def check_fight_over(self):
        if self.combat.result is not None and self.phase != "ending":
            self.phase, self.timer = "ending", 1.1   # let the last hit be seen

    def collect_events(self):
        """Turn the rule engine's event list into floating numbers."""
        for i, ev in enumerate(self.combat.events):
            base = PLAYER_POS if ev["target"] == "player" else ENEMY_POS
            self.floats.append({
                "x": base[0] + random.randint(-50, 50),
                "y": base[1] - 60,
                "text": ev["text"],
                "color": FLOAT_COLORS[ev["kind"]],
                "age": -0.14 * i,       # negative age = wait: staggers multi-hits
                "target": ev["target"],
                "kind": ev["kind"],
                "started": False,
            })
        self.combat.events.clear()

    def show_toast(self, text):
        self.toast, self.toast_time = text, 1.2

    def update(self, dt):
        """Advance timers. dt = seconds since the last frame."""
        self.time += dt
        self.toast_time = max(0.0, self.toast_time - dt)
        for who in self.shake:
            self.shake[who] = max(0.0, self.shake[who] - dt)

        for f in self.floats:
            f["age"] += dt
            if f["age"] >= 0 and not f["started"]:
                f["started"] = True
                if f["kind"] == "damage":
                    self.shake[f["target"]] = 0.25    # shake whoever got hurt
        self.floats = [f for f in self.floats if f["age"] < 1.2]

        if self.state != "combat" or self.paused:
            return
        if self.phase == "enemy":
            self.timer -= dt
            if self.timer <= 0:
                self.combat.enemy_turn()
                self.collect_events()
                self.phase, self.sel = "player", 0
                self.check_fight_over()
        elif self.phase == "ending":
            self.timer -= dt
            if self.timer <= 0:
                self.finish_fight()

    def finish_fight(self):
        result = self.combat.result
        was_boss = self.run_state.floor_info["type"] == "boss"
        self.run_state.finish_combat(self.combat)
        self.show_deck = False
        self.menu_index = 0
        if result == "lose":
            self.state = "lose"
        elif was_boss:
            self.advance()          # last floor cleared -> victory screen
        else:
            self.reward_cards = self.run_state.reward_choices()
            self.state = "reward"

    # ------------------------------------------------------------------
    # Drawing helpers
    # ------------------------------------------------------------------
    def font(self, size):
        """Fonts are slow to load, so each size is loaded once and reused."""
        if size not in self.fonts:
            self.fonts[size] = pygame.font.Font(None, size)   # None = built-in font
        return self.fonts[size]

    def text(self, string, size, color, pos, anchor="topleft", surface=None):
        """Draw one line of text. anchor names which point of the text sits
        at pos, e.g. "center" or "midtop". Returns the rectangle it covered."""
        img = self.font(size).render(str(string), True, color)
        rect = img.get_rect(**{anchor: pos})
        (surface or self.canvas).blit(img, rect)
        return rect

    def wrap(self, string, size, width):
        """Split text into lines that each fit inside `width` pixels."""
        font = self.font(size)
        lines, line = [], ""
        for word in string.split():
            trial = (line + " " + word).strip()
            if font.size(trial)[0] <= width or not line:
                line = trial
            else:
                lines.append(line)
                line = word
        if line:
            lines.append(line)
        return lines

    def panel(self, rect, color=PANEL, border=None, radius=12, width=3):
        pygame.draw.rect(self.canvas, color, rect, border_radius=radius)
        if border:
            pygame.draw.rect(self.canvas, border, rect, width, border_radius=radius)

    def zone(self, rect, func):
        """Make a rectangle clickable/tappable for this frame."""
        self.click_zones.append((pygame.Rect(rect), func))

    def button_name(self, action):
        """The label to show for an action, matching the device in use."""
        pad = {"confirm": "A", "cancel": "B", "deck": "X", "end_turn": "Y", "menu": "Menu"}
        keys = {"confirm": "Enter", "cancel": "Backspace", "deck": "Tab", "end_turn": "E", "menu": "Esc"}
        return (pad if self.last_device == "pad" else keys)[action]

    def draw_card(self, card_id, rect, selected=False, playable=True):
        """Draw one card inside rect (any size: everything scales with it)."""
        card = data.CARDS[card_id]
        rect = pygame.Rect(rect)
        s = rect.w / CARD_W                           # scale factor
        color = CARD_COLORS[card["type"]]
        if not playable:
            color = tuple(c // 2 + 20 for c in color)  # dim cards you can't afford
        self.panel(rect, color, GOLD if selected else (20, 16, 22), radius=int(12 * s),
                   width=max(2, int((5 if selected else 3) * s)))
        # darker box for the rules text
        box = pygame.Rect(rect.x + 10 * s, rect.y + 96 * s, rect.w - 20 * s, rect.h - 108 * s)
        pygame.draw.rect(self.canvas, (28, 24, 32), box, border_radius=int(8 * s))
        # name (shrinks a little if it is long)
        name_size = int(26 * s)
        while self.font(name_size).size(card["name"])[0] > rect.w - 50 * s and name_size > 10:
            name_size -= 1
        self.text(card["name"], name_size, TEXT, (rect.centerx + 12 * s, rect.y + 28 * s), "center")
        self.text(card["type"].upper(), int(16 * s), (230, 215, 200), (rect.centerx, rect.y + 72 * s), "center")
        # energy cost in the top-left corner
        center = (rect.x + 24 * s, rect.y + 26 * s)
        pygame.draw.circle(self.canvas, (28, 24, 32), center, 19 * s)
        pygame.draw.circle(self.canvas, EMBER, center, 19 * s, max(2, int(3 * s)))
        self.text(card["cost"], int(30 * s), EMBER, center, "center")
        # rules text, wrapped and centered in the box
        size = int(22 * s)
        lines = self.wrap(card["text"], size, box.w - 10 * s)
        line_h = self.font(size).get_linesize()
        y = box.centery - line_h * len(lines) / 2
        for line in lines:
            self.text(line, size, TEXT, (box.centerx, y), "midtop")
            y += line_h

    def draw_bar(self, fighter, center_x, y, width=240):
        """HP bar with the block amount and status badges under a fighter."""
        rect = pygame.Rect(center_x - width // 2, y, width, 26)
        pygame.draw.rect(self.canvas, (60, 26, 26), rect, border_radius=8)
        fill = rect.copy()
        fill.w = int(width * fighter.hp / fighter.max_hp)
        if fill.w > 0:
            pygame.draw.rect(self.canvas, RED, fill, border_radius=8)
        pygame.draw.rect(self.canvas, (16, 12, 18), rect, 3, border_radius=8)
        self.text(f"{fighter.hp} / {fighter.max_hp}", 24, TEXT, rect.center, "center")
        if fighter.block > 0:
            # blue shield badge on the left end of the bar
            c = (rect.x - 26, rect.centery)
            pygame.draw.circle(self.canvas, BLUE, c, 22)
            pygame.draw.circle(self.canvas, (16, 12, 18), c, 22, 3)
            self.text(fighter.block, 28, (255, 255, 255), c, "center")
        # one small badge per active status
        x = rect.x
        for status, amount in fighter.statuses.items():
            if amount > 0:
                label = f"{status.capitalize()} {amount}"
                w = self.font(22).size(label)[0] + 16
                badge = pygame.Rect(x, rect.bottom + 8, w, 26)
                pygame.draw.rect(self.canvas, STATUS_COLORS[status], badge, border_radius=8)
                self.text(label, 22, (20, 16, 22), badge.center, "center")
                x += w + 6

    def offset(self, who, pos):
        """Fighter position with idle bobbing and hit-shake applied."""
        x, y = pos
        y += math.sin(self.time * 2 + (0 if who == "player" else 1.5)) * 4
        if self.shake[who] > 0:
            x += random.randint(-6, 6)
        return int(x), int(y)

    def draw_player(self):
        x, y = self.offset("player", PLAYER_POS)
        c = self.canvas
        pygame.draw.ellipse(c, (14, 10, 16), (x - 80, y + 96, 160, 26))             # shadow
        pygame.draw.polygon(c, (70, 95, 140), [(x - 50, y + 105), (x + 50, y + 105), (x + 30, y - 20), (x - 30, y - 20)])  # cloak
        pygame.draw.circle(c, (225, 190, 160), (x, y - 50), 32)                     # head
        pygame.draw.polygon(c, (50, 70, 110), [(x - 36, y - 46), (x + 36, y - 46), (x, y - 100)])  # hood
        pygame.draw.circle(c, (30, 24, 34), (x + 10, y - 44), 4)                    # eye
        pygame.draw.line(c, (200, 200, 210), (x + 46, y + 40), (x + 96, y - 50), 8) # sword
        pygame.draw.line(c, (120, 90, 60), (x + 38, y + 30), (x + 60, y + 44), 8)   # hilt
        pygame.draw.circle(c, (120, 90, 60), (x - 44, y + 40), 34)                  # shield
        pygame.draw.circle(c, GOLD, (x - 44, y + 40), 34, 4)

    def draw_enemy(self, enemy_def):
        x, y = self.offset("enemy", ENEMY_POS)
        c = self.canvas
        col = enemy_def["color"]
        dark = tuple(v * 2 // 3 for v in col)
        shape = enemy_def["shape"]
        pygame.draw.ellipse(c, (14, 10, 16), (x - 100, y + 96, 200, 28))            # shadow
        if shape == "blob":
            pygame.draw.ellipse(c, col, (x - 95, y - 20, 190, 130))
            pygame.draw.ellipse(c, dark, (x - 95, y - 20, 190, 130), 5)
            eyes = [(x - 30, y + 30), (x + 30, y + 30)]
        elif shape == "beast":
            pygame.draw.polygon(c, dark, [(x - 70, y - 30), (x - 50, y - 90), (x - 25, y - 35)])   # ears
            pygame.draw.polygon(c, dark, [(x + 70, y - 30), (x + 50, y - 90), (x + 25, y - 35)])
            pygame.draw.ellipse(c, col, (x - 100, y - 50, 200, 160))
            pygame.draw.polygon(c, (240, 235, 225), [(x - 18, y + 62), (x - 6, y + 62), (x - 12, y + 82)])  # fangs
            pygame.draw.polygon(c, (240, 235, 225), [(x + 6, y + 62), (x + 18, y + 62), (x + 12, y + 82)])
            eyes = [(x - 36, y + 5), (x + 36, y + 5)]
        elif shape == "brute":
            pygame.draw.rect(c, col, (x - 90, y - 40, 180, 150), border_radius=24)
            pygame.draw.rect(c, dark, (x - 90, y - 40, 180, 150), 5, border_radius=24)
            pygame.draw.rect(c, col, (x - 45, y - 100, 90, 80), border_radius=18)   # head
            pygame.draw.rect(c, dark, (x - 130, y - 20, 44, 100), border_radius=16) # arms
            pygame.draw.rect(c, dark, (x + 86, y - 20, 44, 100), border_radius=16)
            eyes = [(x - 18, y - 62), (x + 18, y - 62)]
        elif shape == "ghost":
            pygame.draw.circle(c, col, (x, y - 20), 85)
            pygame.draw.rect(c, col, (x - 85, y - 20, 170, 100))
            for i in range(4):                                                       # wavy hem
                pygame.draw.circle(c, BG, (x - 64 + i * 43, y + 84), 22)
            eyes = [(x - 30, y - 20), (x + 30, y - 20)]
        else:  # dragon
            pygame.draw.polygon(c, dark, [(x - 60, y), (x - 190, y - 110), (x - 150, y + 60)])     # wings
            pygame.draw.polygon(c, dark, [(x + 60, y), (x + 190, y - 110), (x + 150, y + 60)])
            pygame.draw.ellipse(c, col, (x - 105, y - 50, 210, 165))
            pygame.draw.polygon(c, GOLD, [(x - 55, y - 40), (x - 75, y - 120), (x - 25, y - 50)])  # horns
            pygame.draw.polygon(c, GOLD, [(x + 55, y - 40), (x + 75, y - 120), (x + 25, y - 50)])
            pygame.draw.ellipse(c, (250, 190, 90), (x - 50, y + 40, 100, 60))                      # belly
            eyes = [(x - 38, y - 5), (x + 38, y - 5)]
        for ex, ey in eyes:
            pygame.draw.circle(c, (250, 240, 200), (ex, ey), 14)
            pygame.draw.circle(c, (30, 20, 20), (ex - 3, ey + 2), 6)

    def draw_top_bar(self):
        """Strip along the top: game name, floor tracker, HP, deck size."""
        run = self.run_state
        pygame.draw.rect(self.canvas, PANEL, (0, 0, W, 56))
        self.text("EMBERDEEP", 30, EMBER, (20, 28), "midleft")
        # one pip per floor; the current one is highlighted
        count = len(data.FLOORS)
        start_x = W // 2 - (count - 1) * 22
        for i, floor in enumerate(data.FLOORS):
            center = (start_x + i * 44, 28)
            if i < run.floor:
                color = (90, 84, 96)          # already cleared
            elif i == run.floor:
                color = EMBER                 # you are here
            else:
                color = PANEL_LIGHT
            pygame.draw.circle(self.canvas, color, center, 17)
            self.text(FLOOR_LETTERS[floor["type"]], 24, BG if i == run.floor else TEXT, center, "center")
        hp = self.combat.player.hp if self.combat else run.hp
        self.text(f"HP {hp}/{run.max_hp}", 28, RED, (W - 190, 28), "midright")
        rect = self.text(f"Deck {len(run.deck)}  [{self.button_name('deck')}]", 28, TEXT, (W - 20, 28), "midright")
        self.zone(rect.inflate(20, 24), lambda: self.handle_action("deck"))

    def draw_hints(self, hints):
        """Strip along the bottom listing which button does what."""
        pygame.draw.rect(self.canvas, PANEL, (0, H - 36, W, 36))
        line = "     ".join(f"[{self.button_name(a)}] {label}" for a, label in hints)
        self.text(line, 24, MUTED, (W // 2, H - 18), "center")

    def draw_menu(self, options, index, center_x, top, on_choose, width=360):
        """A vertical list of big buttons with one highlighted."""
        for i, label in enumerate(options):
            rect = pygame.Rect(0, 0, width, 62)
            rect.midtop = (center_x, top + i * 78)
            chosen = i == index
            self.panel(rect, PANEL_LIGHT if chosen else PANEL, GOLD if chosen else None)
            self.text(label, 34, TEXT if chosen else MUTED, rect.center, "center")
            self.zone(rect, lambda i=i: on_choose(i))

    # ------------------------------------------------------------------
    # Screens
    # ------------------------------------------------------------------
    def draw(self):
        self.click_zones = []       # rebuilt every frame by whatever is drawn
        self.canvas.fill(BG)
        getattr(self, "draw_" + self.state)()
        if self.show_deck:
            self.draw_deck_overlay()
        if self.paused:
            self.draw_pause()
        # Stretch the canvas onto the real window, centered, with black bars
        # if the window is a different shape.
        scale, ox, oy = self.fit()
        self.window.fill((0, 0, 0))
        if scale == 1:
            self.window.blit(self.canvas, (ox, oy))
        else:
            scaled = pygame.transform.smoothscale(self.canvas, (int(W * scale), int(H * scale)))
            self.window.blit(scaled, (ox, oy))
        pygame.display.flip()

    def draw_title(self):
        self.text("EMBERDEEP", 130, EMBER, (W // 2, 190), "center")
        self.text("A small deck-building dungeon crawl", 34, MUTED, (W // 2, 275), "center")
        self.draw_menu(["New Run", "How to Play", "Quit"], self.menu_index, W // 2, 380, self.title_choose)
        self.draw_hints([("confirm", "Select")])

    def draw_howto(self):
        self.text("How to Play", 64, EMBER, (W // 2, 80), "center")
        lines = [
            "Fight your way down 9 floors and beat the Ember Wyrm.",
            "",
            "Each turn you draw 5 cards and get 3 Energy. Cards cost Energy to play.",
            "Attacks hurt the enemy. Block soaks up damage, but only until your next turn.",
            "The bubble above the enemy shows exactly what it will do next.",
            "After each fight, pick a new card to add to your deck.",
            "",
            data.STATUS_INFO["strength"],
            data.STATUS_INFO["weak"],
            data.STATUS_INFO["vulnerable"],
            "Exhaust: the card is gone until the next fight.",
            "",
            "Controller:  D-pad or stick = choose    A = play    Y = end turn    X = view deck",
            "Keyboard:  Arrows = choose    Enter = play    E = end turn    Tab = view deck",
            "Touch screen:  tap a card to pick it, tap it again to play it.",
        ]
        y = 150
        for line in lines:
            self.text(line, 28, TEXT, (W // 2, y), "midtop")
            y += 36
        self.zone((0, 0, W, H), lambda: self.handle_action("confirm"))
        self.draw_hints([("confirm", "Back")])

    def draw_combat(self):
        combat = self.combat
        self.draw_top_bar()

        # --- the two fighters ---
        self.draw_player()
        self.draw_bar(combat.player, PLAYER_POS[0], 412)
        if combat.enemy.alive:
            self.draw_enemy(combat.enemy_def)
        self.text(combat.enemy.name, 32, TEXT, (ENEMY_POS[0], 84), "center")
        self.draw_bar(combat.enemy, ENEMY_POS[0], 412)

        # --- enemy intent bubble ---
        if combat.result is None:
            intent = "Next:  " + "  +  ".join(combat.intent_text())
            w = self.font(28).size(intent)[0] + 36
            bubble = pygame.Rect(0, 0, w, 40)
            bubble.center = (ENEMY_POS[0], 124)
            self.panel(bubble, PANEL_LIGHT, EMBER, radius=18, width=2)
            self.text(intent, 28, TEXT, bubble.center, "center")

        # --- message line between the fighters and the hand ---
        if self.toast_time > 0:
            self.text(self.toast, 30, GOLD, (W // 2, 482), "center")
        elif self.phase == "enemy":
            self.text("Enemy turn...", 30, MUTED, (W // 2, 482), "center")
        elif self.phase == "ending":
            won = combat.result == "win"
            self.text("Victory!" if won else "You fall...", 40, GOLD if won else RED, (W // 2, 482), "center")
        else:
            # explain any status currently in play, so nothing is a mystery
            active = [s for s in data.STATUS_INFO
                      if combat.player.statuses[s] > 0 or combat.enemy.statuses[s] > 0]
            if active:
                self.text("   ".join(data.STATUS_INFO[s] for s in active[:2]), 22, MUTED, (W // 2, 482), "center")

        # --- energy, draw pile and discard pile (bottom left) ---
        orb = (92, 600)
        pygame.draw.circle(self.canvas, (60, 34, 20), orb, 50)
        pygame.draw.circle(self.canvas, EMBER, orb, 50, 5)
        self.text(combat.energy, 60, EMBER, orb, "center")
        self.text("Energy", 22, MUTED, (orb[0], orb[1] + 66), "center")
        self.text(f"Draw pile: {len(combat.draw_pile)}", 22, MUTED, (orb[0], 706), "center")
        self.text(f"Discard: {len(combat.discard_pile)}", 22, MUTED, (orb[0], 730), "center")

        # --- end turn button (bottom right) ---
        end_rect = pygame.Rect(1118, 580, 146, 70)
        active = self.phase == "player"
        self.panel(end_rect, PANEL_LIGHT if active else PANEL, EMBER if active else None)
        self.text("End Turn", 30, TEXT if active else MUTED, (end_rect.centerx, end_rect.y + 24), "center")
        self.text(f"[{self.button_name('end_turn')}]", 22, MUTED, (end_rect.centerx, end_rect.y + 52), "center")
        if active:
            self.zone(end_rect, lambda: self.handle_action("end_turn"))

        # --- the hand ---
        self.draw_hand()

        # --- floating numbers on top of everything ---
        for f in self.floats:
            if f["age"] >= 0:
                self.text(f["text"], 40, f["color"], (f["x"], f["y"] - f["age"] * 70), "center")

        self.draw_hints([("confirm", "Play card"), ("end_turn", "End turn"), ("deck", "View deck"), ("menu", "Menu")])

    def draw_hand(self):
        combat = self.combat
        n = len(combat.hand)
        if n == 0:
            return
        # Cards sit side by side; with a big hand they overlap to still fit.
        left, right = 190, 1100
        gap = min(CARD_W + 12, (right - left - CARD_W) / max(1, n - 1))
        total = gap * (n - 1) + CARD_W
        x0 = (left + right) / 2 - total / 2
        self.sel = max(0, min(self.sel, n - 1))    # safety: never point past the last card
        order = [i for i in range(n) if i != self.sel] + [self.sel]   # selected drawn last = on top
        for i in order:
            selected = i == self.sel and self.phase == "player"
            rect = pygame.Rect(x0 + i * gap, 530 - (34 if selected else 0), CARD_W, CARD_H)
            self.draw_card(combat.hand[i], rect, selected, combat.can_play(i))
            if self.phase == "player":
                self.zone(rect, lambda i=i: self.click_card(i))

    def click_card(self, i):
        """Tap once to pick a card, tap the picked card again to play it."""
        if self.sel == i:
            self.play_selected()
        else:
            self.sel = i

    def draw_reward(self):
        self.draw_top_bar()
        self.text("Victory!  Choose a card to add to your deck", 44, GOLD, (W // 2, 120), "center")
        for i, card_id in enumerate(self.reward_cards):
            rect = pygame.Rect(0, 0, 220, 308)
            rect.center = (W // 2 + (i - 1) * 280, 350 - (16 if i == self.menu_index else 0))
            self.draw_card(card_id, rect, i == self.menu_index)
            self.zone(rect, lambda i=i: self.reward_choose(i))
        skip = pygame.Rect(0, 0, 300, 62)
        skip.center = (W // 2, 610)
        chosen = self.menu_index == 3
        self.panel(skip, PANEL_LIGHT if chosen else PANEL, GOLD if chosen else None)
        self.text("Skip (take nothing)", 30, TEXT if chosen else MUTED, skip.center, "center")
        self.zone(skip, lambda: self.reward_choose(3))
        self.draw_hints([("confirm", "Choose"), ("deck", "View deck"), ("menu", "Menu")])

    def draw_rest(self):
        run = self.run_state
        self.draw_top_bar()
        self.text("A quiet campfire", 56, EMBER, (W // 2, 140), "center")
        heal = min(int(run.max_hp * data.REST_HEAL_FRACTION), run.max_hp - run.hp)
        options = [
            ("Rest", f"Heal {heal} HP", f"({run.hp} -> {run.hp + heal})"),
            ("Toughen Up", f"+{data.REST_FORTIFY_HP} Max HP", f"({run.max_hp} -> {run.max_hp + data.REST_FORTIFY_HP})"),
        ]
        for i, (title, line1, line2) in enumerate(options):
            rect = pygame.Rect(0, 0, 360, 260)
            rect.center = (W // 2 + (i * 2 - 1) * 220, 400)
            chosen = i == self.menu_index
            self.panel(rect, PANEL_LIGHT if chosen else PANEL, GOLD if chosen else None)
            self.text(title, 48, TEXT, (rect.centerx, rect.y + 70), "center")
            self.text(line1, 34, GREEN, (rect.centerx, rect.y + 140), "center")
            self.text(line2, 28, MUTED, (rect.centerx, rect.y + 190), "center")
            self.zone(rect, lambda i=i: self.rest_choose(i))
        self.draw_hints([("confirm", "Choose"), ("deck", "View deck"), ("menu", "Menu")])

    def draw_win(self):
        self.text("The Ember Wyrm is slain!", 80, GOLD, (W // 2, 260), "center")
        self.text(f"You escaped with {self.run_state.hp} HP and a {len(self.run_state.deck)}-card deck.",
                  36, TEXT, (W // 2, 360), "center")
        self.zone((0, 0, W, H), lambda: self.handle_action("confirm"))
        self.draw_hints([("confirm", "Back to title")])

    def draw_lose(self):
        self.text("You were defeated", 80, RED, (W // 2, 260), "center")
        name = self.combat.enemy.name if self.combat else "the dungeon"
        self.text(f"Felled by {name} on floor {self.run_state.floor + 1} of {len(data.FLOORS)}.",
                  36, TEXT, (W // 2, 360), "center")
        self.zone((0, 0, W, H), lambda: self.handle_action("confirm"))
        self.draw_hints([("confirm", "Back to title")])

    def draw_deck_overlay(self):
        """Dim the screen and show every card in the deck in a grid."""
        self.click_zones = []                       # nothing underneath is clickable
        shade = pygame.Surface((W, H), pygame.SRCALPHA)
        shade.fill((10, 8, 12, 225))
        self.canvas.blit(shade, (0, 0))
        deck = sorted(self.run_state.deck, key=lambda cid: data.CARDS[cid]["name"])
        self.text(f"Your deck  ({len(deck)} cards)", 44, GOLD, (W // 2, 46), "center")
        cols = 6
        rows = max(1, math.ceil(len(deck) / cols))
        # Shrink the cards if the deck needs more rows than fit at full size.
        scale = min(1.0, (H - 140) / (rows * (CARD_H + 14)))
        cw, ch = CARD_W * scale, CARD_H * scale
        x0 = W / 2 - (cols * (cw + 10) - 10) / 2
        for i, card_id in enumerate(deck):
            rect = pygame.Rect(x0 + (i % cols) * (cw + 10), 90 + (i // cols) * (ch + 12), cw, ch)
            self.draw_card(card_id, rect)
        self.zone((0, 0, W, H), lambda: self.handle_action("cancel"))
        self.draw_hints([("cancel", "Close")])

    def draw_pause(self):
        self.click_zones = []
        shade = pygame.Surface((W, H), pygame.SRCALPHA)
        shade.fill((10, 8, 12, 225))
        self.canvas.blit(shade, (0, 0))
        self.text("Paused", 64, EMBER, (W // 2, 240), "center")
        self.draw_menu(["Resume", "Abandon run"], self.pause_index, W // 2, 330, self.pause_choose)
        self.draw_hints([("confirm", "Select"), ("cancel", "Resume")])

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------
    def run(self):
        while self.running:
            dt = self.clock.tick(60) / 1000.0     # seconds since last frame, capped at 60 fps
            dt = min(dt, 0.1)                     # a long hitch must not skip timers ahead
            self.handle_events()
            self.update(dt)
            self.draw()
        pygame.quit()


def main():
    """Start the game. Add --windowed to run in a window instead of fullscreen."""
    App(windowed="--windowed" in sys.argv).run()
