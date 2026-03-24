# Chill Focus Mate

**A Claude Code plugin that turns your terminal into an immersive coding environment — ambient music, voice notifications, audio ducking, and a built-in Pomodoro timer, all wired into the Claude Code lifecycle.**

GitHub: [https://github.com/JSLEEKR/Muji](https://github.com/JSLEEKR/Muji)

---

## Features

- **Ambient background music** — Stream Lo-Fi, Jazz, Nature, or Classical from YouTube, or play a local file. Powered by `mpv` + `yt-dlp`.
- **Context-aware audio ducking** — BGM volume automatically fades down when a notification plays, then fades back up.
- **TTS voice notifications** — Spoken announcements on key events (session start, git push, build failure, Pomodoro end). Supports multiple engines including `edge-tts`, ElevenLabs, Coqui, espeak, and the system voice.
- **Sound effects** — Distinct WAV cues for success, warnings, errors, and timer events.
- **Pomodoro timer** — 25/5/15 minute work-break cycles, running as a background daemon with audio cues at phase transitions.
- **Focus mode presets** — One command switches music, volume, TTS, and Pomodoro behaviour together (`deep`, `write`, `chill`).
- **Background research subagent** — Dispatch a research task with `/mate research <topic>`; get notified when results are ready.
- **Lifecycle hooks** — Reacts automatically to `SessionStart`, `PostToolUse` (Bash, Write/Edit), `TaskCompleted`, `TeammateIdle`, and `Stop` events.
- **Multilingual TTS** — Voice selection per language: English, Korean, Japanese, Chinese, Spanish, French, German, Portuguese, Russian.

---

## Quick Start

### 1. Install system dependencies

```bash
# macOS
brew install mpv yt-dlp
# TTS (pick one or more)
pip install edge-tts            # recommended — free, natural, requires internet

# Linux (Debian / Ubuntu)
sudo apt install mpv socat
pip install yt-dlp edge-tts
```

See [Dependencies](#dependencies) for the full list and Windows WSL notes.

### 2. Install the plugin

```bash
git clone https://github.com/JSLEEKR/Muji.git ~/.claude/plugins/chill-focus-mate
cd ~/.claude/plugins/chill-focus-mate
npm install
node scripts/cli/setup.js      # checks all dependencies, reports missing tools
```

### 3. Register the plugin with Claude Code

Follow the Claude Code plugin installation flow for your version. The plugin entry point is `package.json` and hooks are declared in `hooks/hooks.json`.

### 4. Start a Claude Code session

BGM starts automatically on session open (if `bgm.auto_start: true`). You will hear a soft chime and a TTS greeting.

To kill all managed processes without ending your session:

```bash
node scripts/cli/reset.js
```

---

## Configuration

User config lives at:

```
~/.claude/.chill-focus-mate/config.yaml
```

If the file does not exist, `config/default.yaml` is used as-is. Create the user file to override only the keys you want to change — the loader deep-merges the two files.

### Key settings

| Key | Default | Description |
|-----|---------|-------------|
| `language` | `en` | Language for TTS messages. Affects voice selection. Supported: `en ko ja zh es fr de pt ru` |
| `tts.engine` | `edge-tts` | Primary TTS engine |
| `tts.fallback_engine` | `system` | Used when primary engine fails |
| `tts.cache_enabled` | `true` | Cache synthesized audio files |
| `tts.cache_max_mb` | `200` | Maximum TTS cache size |
| `bgm.enabled` | `true` | Enable background music |
| `bgm.auto_start` | `true` | Start BGM automatically at session open |
| `bgm.default_mode` | `lofi` | Default music mode on startup |
| `bgm.volume` | `30` | BGM volume (0–100) |
| `sfx.enabled` | `true` | Enable sound effects |
| `sfx.volume` | `80` | SFX volume (0–100) |
| `notifications.ducking.enabled` | `true` | Duck BGM during notifications |
| `notifications.ducking.duck_volume` | `10` | BGM volume while a notification plays |
| `pomodoro.work_minutes` | `25` | Work session length |
| `pomodoro.short_break_minutes` | `5` | Short break length |
| `pomodoro.long_break_minutes` | `15` | Long break length |
| `pomodoro.sessions_before_long_break` | `4` | Pomodoros before a long break |

To override a single value, create `~/.claude/.chill-focus-mate/config.yaml` containing only the keys you want:

```yaml
language: ko
bgm:
  volume: 20
tts:
  engine: system
```

---

## Slash Commands

### `/focus`

Switch the overall working preset. Each preset configures music mode, volume, TTS on/off, and Pomodoro behaviour in one step.

```
/focus deep    — Lo-Fi at low volume, SFX only (TTS disabled), Pomodoro auto-starts
/focus write   — Jazz + Rain at low volume, gentle TTS enabled
/focus chill   — Nature sounds, full TTS notifications, relaxed pace
/focus off     — Stop music, disable all notifications for the session
```

### `/music`

Control background music directly.

```
/music lofi              — Switch to Lo-Fi Hip Hop stream
/music jazz              — Switch to Jazz & Rain stream
/music nature            — Switch to Nature Sounds stream
/music classical         — Switch to Classical Focus stream
/music off               — Stop music
/music volume 40         — Set volume to 40 (0–100)
/music status            — Show current mode, volume, and playback state
/music <url>             — Play any YouTube URL or local file path
```

Examples:

```
/music https://www.youtube.com/watch?v=jfKfPfyJRdk
/music /home/user/music/ambient.mp3
/music volume 15
```

### `/timer`

Manage the Pomodoro work/break timer.

```
/timer start             — Begin a 25-minute work session
/timer stop              — Stop the timer entirely
/timer pause             — Pause the current countdown
/timer resume            — Resume a paused timer
/timer skip              — Skip to the next phase (work → break, or break → work)
/timer status            — Show phase, time remaining, session count
/timer config <key> <v>  — Change a runtime setting, e.g. work_minutes 50
```

Example output from `/timer status`:

```
Phase:    work (session 2 of 4)
Remaining: 18:42
Today:    1 session completed
```

### `/mate`

Dispatch a background research task to the `research-mate` subagent.

```
/mate research <topic>
```

Example:

```
/mate research "Rust async runtimes comparison 2025"
```

The subagent runs in a separate context, searches the web, and saves a summary to `/tmp/cfm-research-output.md`. When it finishes, the `TeammateIdle` hook fires a `knock.wav` sound effect and a TTS notification ("Research is ready."). You can then ask Claude about the results or read the file directly.

---

## Sound Effects and TTS

### Sound effect events

| Event | Sound file | When triggered |
|-------|-----------|----------------|
| Session start | `chime-soft.wav` | Claude Code session opens |
| Git commit | `success.wav` | `git commit` completes without error |
| Git push | `success-big.wav` | `git push` completes without error |
| Test failure | `warn-soft.wav` | Test runner reports failures |
| Build success | `success.wav` | Build command exits cleanly |
| Build failure | `error.wav` | Build command exits with error |
| Lint error | `warn-soft.wav` | Linter reports issues |
| Subagent done | `knock.wav` | Research subagent completes |
| Pomodoro end | `bell.wav` | 25-minute work session ends |
| Pomodoro warning | `tick.wav` | 5 minutes remaining in session |
| Break end | `bell-soft.wav` | Break period ends |
| Generic error | `error.wav` | Unclassified error detected |

Sound files are WAV format, located in `sounds/`. You can override any event's sound file in your `config.yaml`:

```yaml
sfx:
  events:
    commit_success: /path/to/my-sound.wav
    pomodoro_end: null     # null disables the sound for this event
```

### TTS messages

Each event has a configurable message template per language. Use `{variable}` placeholders for dynamic content. Set a message to `null` to suppress speech for that event (SFX still plays).

Example (from default config):

```yaml
notifications:
  messages:
    test_fail:
      en: "{count} tests failed."
      ko: "테스트 {count}개 실패했어."
    push_success:
      en: "Push complete."
      ko: "푸시 완료!"
```

### Audio ducking

When a notification plays, the BGM volume fades from its current level down to `duck_volume` (default: 10) over 300 ms, waits for the SFX and TTS to finish, then fades back up. All notifications are queued sequentially to prevent overlap.

---

## Focus Modes

Three built-in presets are available via `/focus`:

### `deep` — Deep Work

Designed for distraction-free, flow-state coding.

- Music: Lo-Fi Hip Hop at volume 25
- Notifications: SFX only — TTS is disabled
- Pomodoro: auto-starts when the mode is activated

### `write` — Writing Mode

For documentation, essays, or long-form work.

- Music: Jazz & Rain at volume 20
- Notifications: TTS enabled, gentle tone
- Pomodoro: manual start

### `chill` — Chill Mode

Relaxed pace with full audio feedback.

- Music: Nature Sounds at volume 35
- Notifications: Full TTS and SFX
- Pomodoro: manual start

During Pomodoro breaks, the music mode switches automatically to `nature` (short and long breaks) regardless of which focus mode is active, then returns when the work session resumes. This behaviour is configurable via `pomodoro.music_override`.

---

## Pomodoro Timer

The timer runs as a detached Node.js daemon process managed via a PID file at `/tmp/cfm-pomodoro.pid`. Status is written to `/tmp/cfm-pomodoro-status.json` for polling by `/timer status`.

**Default cycle:**

```
[Work 25 min] → [Short break 5 min] × 4
                                      ↓
                              [Long break 15 min]
                                      ↓
                              (repeat from work)
```

- A warning notification fires 5 minutes before the end of each work session.
- Breaks start automatically after work ends (`auto_start_break: true`).
- The next work session requires a manual `/timer start` by default (`auto_start_work: false`).
- During breaks, BGM switches to Nature Sounds mode then returns to the previous mode when work resumes.

All of these defaults are configurable under the `pomodoro` key in your config file.

---

## Dependencies

### Required

| Tool | Purpose | Install |
|------|---------|---------|
| `mpv` | Audio playback for BGM and SFX | `brew install mpv` / `apt install mpv` |
| `Node.js >= 18` | Plugin runtime | [nodejs.org](https://nodejs.org) |

### Strongly recommended

| Tool | Purpose | Install |
|------|---------|---------|
| `yt-dlp` | Stream YouTube URLs through mpv | `brew install yt-dlp` / `pip install yt-dlp` |
| `socat` | Unix socket communication with mpv IPC (Linux) | `apt install socat` |

### TTS engines (choose at least one)

| Engine | Quality | Offline | Cost | Install |
|--------|---------|---------|------|---------|
| `edge-tts` | Natural | No (requires internet) | Free | `pip install edge-tts` |
| `espeak-ng` | Robotic | Yes | Free | `apt install espeak-ng` / `brew install espeak` |
| `system` | Good | Yes | Free | Built-in (`say` on macOS, `spd-say` on Linux) |
| `coqui` | Moderate | Yes | Free | `pip install TTS` |
| ElevenLabs | Premium | No | Paid | Set `ELEVENLABS_API_KEY` env var |

The default engine is `edge-tts`. If it fails (e.g., no internet), the plugin falls back to the `system` engine automatically. The setup script (`npm run setup`) checks which engines are available and reports the status.

### Checking dependencies

```bash
npm run setup
```

This script verifies that `mpv`, `yt-dlp`, and at least one TTS engine are present, and prints a summary of what is installed, what is missing, and how to install missing items.

---

## Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| macOS | Primary | All features supported. Uses `say` as system TTS. `socat` not required (macOS uses a different IPC method). |
| Linux | Primary | Requires `socat` for mpv IPC socket communication. Uses `spd-say` or `pico2wave` as system TTS. |
| Windows (WSL2) | Best-effort | Run inside WSL2. Audio output requires a configured PulseAudio or PipeWire bridge to the Windows host. `mpv` and other tools must be installed inside WSL. Native Windows is not supported. |

---

## Project Structure

```
chill-focus-mate/
├── commands/
│   ├── focus.md          # /focus command definition
│   ├── music.md          # /music command definition
│   ├── timer.md          # /timer command definition
│   └── mate.md           # /mate command definition
├── agents/
│   └── research-mate.md  # Background research subagent
├── skills/
│   └── focus-tips.md     # Contextual productivity tips
├── hooks/
│   └── hooks.json        # Hook event registrations
├── scripts/
│   ├── core/
│   │   ├── bgm.js        # Background music manager (mpv IPC)
│   │   ├── notify.js     # Ducking + SFX + TTS orchestrator
│   │   ├── tts.js        # Multi-engine TTS abstraction
│   │   ├── pomodoro.js   # Pomodoro timer daemon
│   │   └── config.js     # Configuration loader
│   ├── handlers/         # One file per lifecycle hook
│   └── cli/
│       ├── setup.js      # Dependency checker
│       └── reset.js      # Kill all managed processes
├── sounds/               # WAV sound effect files
├── config/
│   └── default.yaml      # Default configuration
└── package.json
```

---

## License

MIT — see [LICENSE](LICENSE).
