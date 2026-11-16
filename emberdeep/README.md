# Emberdeep

A small deck-building dungeon crawl for the Steam Deck. Fight down 9 floors (fights, an elite, two campfires) and beat the Ember Wyrm. Win a fight and you pick a new card for your deck.

## Code

| File | What's in it |
|---|---|
| `game/data.py` | Every card, enemy, floor and player number. Tweak the game here. |
| `game/combat.py` | The rules of a fight and of a run. It never touches the screen. |
| `game/ui.py` | Drawing, plus controller, keyboard and touch input. |
| `emberdeep.py` | Starts the game. |
| `tests/simulate.py` | A robot plays 3000 runs to check the rules never break, and reports its win rate. |
| `tests/screens.py` | Presses fake buttons through every screen and saves screenshots. |
| `build.sh` | Builds a single Linux program in `dist/` that runs without Python. |
| `run_from_source.sh` | Fallback launcher for the Deck: sets up pygame in a private folder on first run. |

## Controls

- **Controller:** D-pad or left stick to choose, A to play, Y to end your turn, X to view your deck, Menu to pause.
- **Keyboard:** arrow keys to choose, Enter to play, E to end your turn, Tab to view your deck, Esc to pause, F11 for fullscreen.
- **Touch:** tap a card to pick it, then tap it again to play it.

## On the Steam Deck

1. In Desktop mode, run `./build.sh`, or copy over a build of the `Emberdeep` program.
2. Open Steam, then Games > Add a Non-Steam Game > pick `Emberdeep`.
3. Back in Gaming mode, it's under Library > Non-Steam.

If the buttons do nothing, set the controller layout to the Gamepad template.

## Known limits

- No save: closing the game ends the run.
- No sound.
- The art is placeholder shapes.
