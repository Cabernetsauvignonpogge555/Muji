# /music Command

Control background music playback.

## Usage
- `/music lofi`        — Switch to lo-fi mode
- `/music jazz`        — Switch to jazz mode
- `/music nature`      — Switch to nature sounds
- `/music classical`   — Switch to classical
- `/music <url>`       — Play any YouTube URL or local file
- `/music off`         — Stop music
- `/music volume <n>`  — Set volume (0-100)
- `/music status`      — Show current playback info

## Implementation

Parse the user's subcommand and call the appropriate BGMManager method:

1. If argument is a known mode name (lofi, jazz, nature, classical, silence):
   - Call `bgm.switchMode(mode)`
   - Respond: "Switched to {mode name}."

2. If argument is "off":
   - Call `bgm.stop()`
   - Respond: "Music stopped."

3. If argument is "volume" followed by a number:
   - Call `bgm.setVolume(number)`
   - Respond: "Volume set to {n}."

4. If argument is "status":
   - Report: current mode, volume, playing state

5. If argument looks like a URL or file path:
   - Call `bgm.playUrl(url)`
   - Respond: "Playing custom URL."

6. If no argument or unrecognized:
   - Show usage help
