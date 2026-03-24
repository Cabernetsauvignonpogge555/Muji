# Chill Focus Mate — Design Document

> A Claude Code plugin that combines ambient background music (YouTube/local), context-aware audio ducking, TTS/SFX notifications, pomodoro timer, and an AI research subagent into a seamless coding companion experience.

---

## 1. Project Overview

### 1.1 Vision

Developers spend hours in the terminal with Claude Code, but the experience is silent and disconnected. **Chill Focus Mate** transforms Claude Code sessions into an immersive, productivity-enhancing environment by:

- Playing continuous background music (YouTube streams or local files) via `mpv`
- Delivering context-aware TTS announcements and sound effects on key events
- Auto-ducking background music when notifications play
- Running a pomodoro timer with audio cues
- Providing an AI research subagent that works in the background

### 1.2 Name

**Chill Focus Mate** (package name: `chill-focus-mate`)

### 1.3 Target Platform

- macOS (primary)
- Linux (primary)
- Windows via WSL (best-effort)

### 1.4 License

MIT

---

## 2. Architecture

### 2.1 High-Level Diagram

```
┌──────────────────────────────────────────────────────────┐
│                  Claude Code Plugin                       │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │   Hooks      │  │ Slash Cmds   │  │  Subagents     │  │
│  │              │  │              │  │                │  │
│  │ SessionStart │  │ /focus       │  │ research-mate  │  │
│  │ PostToolUse  │  │ /music       │  │                │  │
│  │ Stop         │  │ /timer       │  │                │  │
│  │ TaskCompleted│  │ /mate        │  │                │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                 │                  │           │
│  ┌──────▼─────────────────▼──────────────────▼────────┐  │
│  │              Core Engine (Node.js)                  │  │
│  │                                                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │  │
│  │  │ BGM      │  │ Notifier │  │ Pomodoro Timer   │ │  │
│  │  │ Manager  │  │          │  │                  │ │  │
│  │  │ (mpv IPC)│  │ (TTS+SFX)│  │ (node scheduler) │ │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘ │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 2.2 Core Modules

| Module | Responsibility | Key Dependencies |
|--------|---------------|-----------------|
| `bgm.js` | Background music playback, YouTube/local, volume control via mpv IPC socket | `mpv`, `yt-dlp` |
| `notify.js` | Audio ducking + SFX playback + TTS generation and playback | `mpv` (SFX), TTS engine |
| `pomodoro.js` | Timer management, session tracking, break scheduling | Node.js built-in |
| `config.js` | Configuration loading, validation, defaults | `yaml` (npm) |
| `tts.js` | Multi-engine TTS abstraction layer | `edge-tts`, `espeak-ng`, `say` (macOS), ElevenLabs API, Coqui |
| `hook-handlers/*.js` | Individual hook event handlers | Core modules above |

### 2.3 Process Model

- **BGM**: A single long-running `mpv` process with `--input-ipc-server` for runtime control
- **SFX**: Short-lived `mpv` instances per sound effect (fire-and-forget)
- **TTS**: Generate audio file → play via short-lived `mpv` instance
- **Pomodoro**: A background Node.js process managed via PID file (`/tmp/cfm-pomodoro.pid`)

---

## 3. Plugin Structure

```
chill-focus-mate/
├── .claude-plugin/
│   └── plugin.json              # Plugin metadata
├── commands/
│   ├── focus.md                 # /focus [deep|write|chill|off]
│   ├── music.md                 # /music [lofi|jazz|nature|off|<url>]
│   ├── timer.md                 # /timer [start|stop|status|config]
│   └── mate.md                  # /mate research <topic>
├── agents/
│   └── research-mate.md         # Background research subagent
├── skills/
│   └── focus-tips.md            # Contextual productivity tips
├── hooks/
│   └── hooks.json               # All hook definitions
├── scripts/
│   ├── core/
│   │   ├── bgm.js              # Background music manager
│   │   ├── notify.js           # Ducking + SFX + TTS orchestrator
│   │   ├── tts.js              # Multi-engine TTS abstraction
│   │   ├── pomodoro.js         # Pomodoro timer daemon
│   │   └── config.js           # Configuration loader
│   ├── handlers/
│   │   ├── on-session-start.js
│   │   ├── on-bash-complete.js
│   │   ├── on-file-write.js
│   │   ├── on-task-done.js
│   │   ├── on-stop.js
│   │   └── on-teammate-idle.js
│   └── cli/
│       ├── setup.js             # Dependency checker & installer
│       └── reset.js             # Kill all managed processes
├── sounds/
│   ├── chime-soft.wav           # Session start
│   ├── success.wav              # Commit/push success
│   ├── success-big.wav          # Major milestone
│   ├── warn-soft.wav            # Test failure, lint error
│   ├── error.wav                # Build/runtime error
│   ├── knock.wav                # Subagent completed
│   ├── bell.wav                 # Pomodoro end
│   ├── bell-soft.wav            # Break end
│   └── tick.wav                 # Pomodoro 5-min warning
├── config/
│   └── default.yaml             # Default configuration
├── package.json
├── DESIGN.md
└── README.md
```

---

## 4. Configuration

### 4.1 Config File Location

```
~/.claude/.chill-focus-mate/config.yaml
```

Falls back to `config/default.yaml` if user config doesn't exist.

### 4.2 Full Default Configuration (`config/default.yaml`)

```yaml
# ============================================================
# Chill Focus Mate — Configuration
# ============================================================

# ----------------------------------------------------------
# Language & Locale
# ----------------------------------------------------------
language: en                     # Default language for TTS
# Supported: en, ko, ja, zh, es, fr, de, pt, ru
# This affects TTS voice selection and notification messages

# ----------------------------------------------------------
# TTS (Text-to-Speech) Engine
# ----------------------------------------------------------
tts:
  engine: edge-tts               # Primary TTS engine
  # Options: edge-tts, elevenlabs, coqui, espeak, system
  #   - edge-tts:    Free, natural, requires internet (recommended)
  #   - elevenlabs:  Premium quality, requires API key, paid
  #   - coqui:       Free, offline, moderate quality
  #   - espeak:      Free, offline, robotic quality
  #   - system:      macOS 'say' / Linux 'spd-say'
  
  fallback_engine: system        # Fallback if primary fails
  
  cache_enabled: true            # Cache generated TTS audio files
  cache_dir: ~/.claude/.chill-focus-mate/tts-cache
  cache_max_mb: 200              # Max cache size in MB

  # Per-engine configuration
  engines:
    edge-tts:
      voices:
        en: en-US-AriaNeural       # English (female, natural)
        ko: ko-KR-SunHiNeural      # Korean (female, natural)
        ja: ja-JP-NanamiNeural      # Japanese (female, natural)
        zh: zh-CN-XiaoxiaoNeural    # Chinese (female, natural)
        es: es-ES-ElviraNeural      # Spanish
        fr: fr-FR-DeniseNeural      # French
        de: de-DE-KatjaNeural       # German
        pt: pt-BR-FranciscaNeural   # Portuguese
        ru: ru-RU-SvetlanaNeural    # Russian
    
    elevenlabs:
      api_key: ""                   # Set via env ELEVENLABS_API_KEY or here
      voice_id: 21m00Tcm4TlvDq8ikWAM  # Default voice (Rachel)
      model_id: eleven_flash_v2_5
      # Custom voices per language (optional)
      voices:
        en: ""                      # Use default voice_id if empty
        ko: ""
    
    coqui:
      model: tts_models/en/ljspeech/tacotron2-DDC
      # Note: limited language support, mainly English
    
    espeak:
      voices:
        en: en
        ko: ko
        ja: ja
        zh: zh
        es: es
        fr: fr
        de: de

    system:
      # macOS 'say' voices
      macos_voices:
        en: Samantha
        ko: Yuna
        ja: Kyoko
        zh: Ting-Ting
      # Linux: uses spd-say with language codes

# ----------------------------------------------------------
# Background Music (BGM)
# ----------------------------------------------------------
bgm:
  enabled: true
  default_mode: lofi              # Default music mode on session start
  volume: 30                      # Default volume (0-100)
  
  # Auto-start BGM when Claude Code session begins
  auto_start: true
  
  # Music modes — each maps to a YouTube URL, playlist, or local path
  modes:
    lofi:
      name: "Lo-Fi Hip Hop"
      sources:
        - https://www.youtube.com/watch?v=jfKfPfyJRdk    # lofi hip hop radio
      fallback_local: null        # Optional local file fallback
    
    jazz:
      name: "Jazz & Rain"
      sources:
        - https://www.youtube.com/watch?v=rUxyKA_-grg
      fallback_local: null
    
    nature:
      name: "Nature Sounds"
      sources:
        - https://www.youtube.com/watch?v=lTRiuFIWV54
      fallback_local: null
    
    classical:
      name: "Classical Focus"
      sources:
        - https://www.youtube.com/watch?v=jgpJVI3tDbY
      fallback_local: null
    
    silence:
      name: "Silence"
      sources: []
  
  # mpv configuration
  mpv:
    socket_path: /tmp/cfm-bgm-socket
    extra_args:
      - "--no-video"
      - "--really-quiet"
      - "--loop=inf"

# ----------------------------------------------------------
# Sound Effects (SFX)
# ----------------------------------------------------------
sfx:
  enabled: true
  volume: 80                      # SFX volume (0-100)
  
  # Override sound files per event (relative to sounds/ dir or absolute path)
  # Set to null to disable specific sounds
  events:
    session_start: chime-soft.wav
    commit_success: success.wav
    push_success: success-big.wav
    test_fail: warn-soft.wav
    build_success: success.wav
    build_fail: error.wav
    lint_error: warn-soft.wav
    subagent_done: knock.wav
    pomodoro_end: bell.wav
    pomodoro_warning: tick.wav
    break_end: bell-soft.wav
    error_generic: error.wav

# ----------------------------------------------------------
# Notifications (TTS Messages)
# ----------------------------------------------------------
notifications:
  enabled: true
  
  # Ducking: lower BGM volume during TTS/SFX playback
  ducking:
    enabled: true
    duck_volume: 10               # BGM volume during notification (0-100)
    fade_duration_ms: 300         # Fade in/out duration in milliseconds
    fade_steps: 6                 # Number of volume steps during fade
  
  # Message templates per event
  # Use {variable} for dynamic content
  # Define per language; falls back to 'en' if current language not found
  messages:
    session_start:
      en: "Let's get started."
      ko: "같이 시작해볼까?"
      ja: "始めよう。"
    
    commit_success:
      en: null                    # null = SFX only, no TTS
      ko: null
    
    push_success:
      en: "Push complete."
      ko: "푸시 완료!"
    
    test_fail:
      en: "{count} tests failed."
      ko: "테스트 {count}개 실패했어."
    
    build_success:
      en: "Build complete, no errors."
      ko: "빌드 끝났어, 에러 없어."
    
    build_fail:
      en: "Build failed. Check the output."
      ko: "빌드 실패했어. 확인해봐."
    
    subagent_done:
      en: "Research is ready."
      ko: "리서치 정리해뒀어."
    
    pomodoro_end:
      en: "25 minutes up. Take a break."
      ko: "25분 지났어, 쉬어가자."
    
    pomodoro_warning:
      en: "5 minutes left."
      ko: "5분 남았어."
    
    break_end:
      en: "Break's over. Ready to continue?"
      ko: "다시 시작할까?"
    
    task_completed:
      en: "Task done."
      ko: "작업 끝났어."
    
    session_end:
      en: "Good work today."
      ko: "오늘 수고했어."
    
    error_generic:
      en: "An error occurred."
      ko: "에러 발생했어."

# ----------------------------------------------------------
# Pomodoro Timer
# ----------------------------------------------------------
pomodoro:
  enabled: true
  work_minutes: 25
  short_break_minutes: 5
  long_break_minutes: 15
  sessions_before_long_break: 4
  auto_start_break: true          # Automatically start break after work
  auto_start_work: false          # Require manual start for next work session
  
  # Music mode overrides during pomodoro phases
  music_override:
    work: null                    # null = keep current mode
    short_break: nature
    long_break: nature

# ----------------------------------------------------------
# Focus Modes (Presets)
# ----------------------------------------------------------
focus_modes:
  deep:
    name: "Deep Work"
    description: "Minimal distraction, lo-fi music, notifications reduced"
    bgm_mode: lofi
    bgm_volume: 25
    notifications_enabled: true
    tts_enabled: false            # SFX only in deep mode
    pomodoro_auto_start: true
  
  write:
    name: "Writing Mode"
    description: "Jazz and rain, gentle notifications"
    bgm_mode: jazz
    bgm_volume: 20
    notifications_enabled: true
    tts_enabled: true
    pomodoro_auto_start: false
  
  chill:
    name: "Chill Mode"
    description: "Relaxed pace, nature sounds, all notifications"
    bgm_mode: nature
    bgm_volume: 35
    notifications_enabled: true
    tts_enabled: true
    pomodoro_auto_start: false

# ----------------------------------------------------------
# Advanced
# ----------------------------------------------------------
advanced:
  pid_file: /tmp/cfm-pomodoro.pid
  log_file: ~/.claude/.chill-focus-mate/cfm.log
  log_level: warn                 # debug, info, warn, error
  
  # Pattern detection for bash commands
  patterns:
    git_commit: "git commit"
    git_push: "git push"
    test_commands:
      - "npm test"
      - "npx jest"
      - "pytest"
      - "cargo test"
      - "go test"
      - "mix test"
      - "bundle exec rspec"
    build_commands:
      - "npm run build"
      - "npx next build"
      - "cargo build"
      - "go build"
      - "make"
      - "gradle build"
    lint_commands:
      - "npm run lint"
      - "eslint"
      - "pylint"
      - "cargo clippy"
```

---

## 5. Module Specifications

### 5.1 BGM Manager (`scripts/core/bgm.js`)

#### Responsibilities
- Start/stop/switch background music via mpv
- Manage mpv process lifecycle
- Expose IPC interface for volume control and track switching

#### API

```javascript
class BGMManager {
  constructor(config)
  
  async start(mode?: string)         // Start playback (default: config.bgm.default_mode)
  async stop()                       // Stop playback, kill mpv process
  async switchMode(mode: string)     // Switch to different mode (stop + start)
  async playUrl(url: string)         // Play arbitrary YouTube URL or local path
  async setVolume(level: number)     // Set volume 0-100
  async getVolume(): number          // Get current volume
  async fadeVolume(target: number, durationMs: number)  // Smooth volume transition
  async pause()                      // Toggle pause
  async resume()                     // Resume playback
  isPlaying(): boolean               // Check if mpv is running
  
  // Internal
  _spawnMpv(source: string)
  _sendIPC(command: any[])           // Send JSON IPC command to mpv socket
  _cleanup()                         // Kill mpv process, remove socket
}
```

#### IPC Protocol

mpv IPC via Unix domain socket at `config.bgm.mpv.socket_path`:

```javascript
// Set volume
_sendIPC(['set_property', 'volume', 30])

// Pause/resume
_sendIPC(['cycle', 'pause'])

// Get property
_sendIPC(['get_property', 'volume'])

// Load new file
_sendIPC(['loadfile', url, 'replace'])
```

#### Error Handling
- If mpv is not installed → log warning, disable BGM, suggest installation
- If yt-dlp is not installed → log warning, YouTube URLs fail gracefully, local files still work
- If mpv process dies → attempt restart once, then disable BGM for session
- If YouTube URL fails → try next source in list, then try fallback_local

### 5.2 TTS Engine (`scripts/core/tts.js`)

#### Responsibilities
- Provide a unified interface for all TTS engines
- Handle language-based voice selection
- Manage TTS audio caching
- Fall back to secondary engine on failure

#### API

```javascript
class TTSEngine {
  constructor(config)
  
  async synthesize(text: string, lang?: string): string   // Returns path to audio file
  async getAvailableEngines(): string[]                   // List installed engines
  async testEngine(engine: string): boolean               // Test if engine works
  
  // Internal
  _synthesizeEdgeTTS(text: string, voice: string): string
  _synthesizeElevenLabs(text: string, voiceId: string): string
  _synthesizeCoqui(text: string, model: string): string
  _synthesizeEspeak(text: string, voice: string): string
  _synthesizeSystem(text: string, voice: string): string
  _getCachedPath(text: string, engine: string, voice: string): string | null
  _saveToCache(audioPath: string, text: string, engine: string, voice: string)
  _cleanCache()                    // Enforce cache_max_mb limit (LRU)
}
```

#### Engine Commands

```bash
# edge-tts (Python package)
edge-tts --voice "en-US-AriaNeural" --text "Hello" --write-media /tmp/cfm-tts.mp3

# ElevenLabs (curl)
curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}" \
  -H "xi-api-key: {api_key}" \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello","model_id":"eleven_flash_v2_5"}' \
  --output /tmp/cfm-tts.mp3

# Coqui TTS (Python package)
tts --text "Hello" --model_name "tts_models/en/ljspeech/tacotron2-DDC" --out_path /tmp/cfm-tts.wav

# espeak-ng
espeak-ng -v en -w /tmp/cfm-tts.wav "Hello"

# macOS system
say -v Samantha -o /tmp/cfm-tts.aiff "Hello"
# Then convert: ffmpeg -i /tmp/cfm-tts.aiff /tmp/cfm-tts.mp3

# Linux system
spd-say -l en -e "Hello"  # Direct playback, no file output
# Alternative: pico2wave -l en-US -w /tmp/cfm-tts.wav "Hello"
```

#### Caching Strategy

Cache key: `SHA256(engine + voice + text)` → filename  
Storage: `~/.claude/.chill-focus-mate/tts-cache/{hash}.mp3`  
Eviction: LRU when total size exceeds `cache_max_mb`

### 5.3 Notifier (`scripts/core/notify.js`)

#### Responsibilities
- Orchestrate the notification flow: duck BGM → play SFX → play TTS → restore BGM
- Resolve message templates with variables
- Handle concurrent notification queuing

#### API

```javascript
class Notifier {
  constructor(config, bgmManager, ttsEngine)
  
  async notify(event: string, vars?: object)   // Main notification method
  async playSFX(soundFile: string)             // Play sound effect only
  async speak(text: string, lang?: string)     // TTS only
  
  // Internal
  _resolveMessage(event: string, vars: object): string | null
  _duckAndRestore(callback: () => Promise<void>)
  _queueNotification(fn: () => Promise<void>)  // Serialize concurrent notifications
}
```

#### Notification Flow

```
1. Check if event has SFX → resolve sound file path
2. Check if event has TTS message → resolve template with variables
3. If either exists:
   a. Duck BGM volume (fade from current → duck_volume)
   b. Play SFX (await completion)
   c. Play TTS (await completion)
   d. Restore BGM volume (fade from duck_volume → original)
4. If neither → no-op
```

#### Concurrency

Notifications are queued sequentially. If a notification is already playing, the next one waits. This prevents overlapping audio and ensures ducking works correctly.

```javascript
// Internal queue implementation
_notificationQueue = Promise.resolve();

_queueNotification(fn) {
  this._notificationQueue = this._notificationQueue
    .then(() => fn())
    .catch(err => logger.error('Notification failed:', err));
}
```

### 5.4 Pomodoro Timer (`scripts/core/pomodoro.js`)

#### Responsibilities
- Manage work/break cycles
- Trigger notifications at appropriate times
- Optionally switch BGM modes during breaks
- Track session statistics

#### API

```javascript
class PomodoroTimer {
  constructor(config, notifier, bgmManager)
  
  start()                          // Start work session
  stop()                           // Stop timer entirely
  skip()                           // Skip current phase (work → break or break → work)
  pause()                          // Pause timer
  resume()                         // Resume timer
  status(): PomodoroStatus         // Current state
  
  // Internal
  _onWorkEnd()
  _onBreakEnd()
  _onWarning()                     // 5 minutes before end
  _savePID()
  _removePID()
}

interface PomodoroStatus {
  phase: 'work' | 'short_break' | 'long_break' | 'stopped'
  remaining_seconds: number
  session_number: number
  total_sessions_today: number
  is_paused: boolean
}
```

#### Process Management

The pomodoro timer runs as a daemon process:

```bash
# Start: spawns detached node process
node scripts/core/pomodoro.js start &
echo $! > /tmp/cfm-pomodoro.pid

# Stop: reads PID and kills
kill $(cat /tmp/cfm-pomodoro.pid)

# Status: communicates via temp file
cat /tmp/cfm-pomodoro-status.json
```

#### Communication

The pomodoro daemon communicates with hook handlers via:
- **Status file**: `/tmp/cfm-pomodoro-status.json` (polled by `/timer status`)
- **Notifications**: Directly invokes the Notifier module

### 5.5 Config Loader (`scripts/core/config.js`)

```javascript
class Config {
  constructor()
  
  load(): object                   // Load and merge configs
  get(path: string): any           // Dot-notation access: config.get('tts.engine')
  getLanguage(): string            // Current language
  getTTSVoice(engine, lang): string
  getBGMSources(mode): string[]
  getSFXPath(event): string | null
  getMessage(event, lang, vars): string | null
  
  // Internal
  _loadDefault(): object
  _loadUser(): object | null
  _merge(defaults, user): object
  _validate(config): void
}
```

---

## 6. Hooks Specification

### 6.1 hooks.json

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $PLUGIN_DIR/scripts/handlers/on-session-start.js"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node $PLUGIN_DIR/scripts/handlers/on-bash-complete.js"
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node $PLUGIN_DIR/scripts/handlers/on-file-write.js"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $PLUGIN_DIR/scripts/handlers/on-stop.js"
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $PLUGIN_DIR/scripts/handlers/on-task-done.js"
          }
        ]
      }
    ],
    "TeammateIdle": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node $PLUGIN_DIR/scripts/handlers/on-teammate-idle.js"
          }
        ]
      }
    ]
  }
}
```

### 6.2 Hook Handler Specifications

#### `on-session-start.js`

```
Trigger: SessionStart
Actions:
  1. Load config
  2. Run dependency check (mpv, yt-dlp, TTS engine)
  3. If bgm.auto_start → start BGM with default mode
  4. If pomodoro.enabled → do NOT auto-start (user triggers via /timer)
  5. Play session_start notification (SFX + TTS)
```

#### `on-bash-complete.js`

```
Trigger: PostToolUse (matcher: Bash)
Input (stdin JSON):
  - tool_input.command: string    # The bash command that was run
  - tool_response.stdout: string  # Command stdout
  - tool_response.stderr: string  # Command stderr

Logic:
  Parse command string against config.advanced.patterns:
  
  IF matches git_commit AND no stderr:
    → notify('commit_success')
  
  IF matches git_push AND no stderr:
    → notify('push_success')
  
  IF matches test_commands:
    IF stderr contains failure indicators:
      Parse failure count from output
      → notify('test_fail', { count })
    ELSE:
      → notify('build_success')  # tests passed
  
  IF matches build_commands:
    IF stderr contains error:
      → notify('build_fail')
    ELSE:
      → notify('build_success')
  
  IF matches lint_commands AND stderr:
    → notify('lint_error')
```

#### `on-file-write.js`

```
Trigger: PostToolUse (matcher: Write|Edit)
Actions:
  Currently a no-op (silent file writes).
  Future: track file write frequency for activity monitoring.
```

#### `on-task-done.js`

```
Trigger: TaskCompleted
Actions:
  1. Notify('task_completed')
```

#### `on-stop.js`

```
Trigger: Stop
Actions:
  1. Notify('session_end')
  2. Stop pomodoro timer if running
  3. Stop BGM
  4. Cleanup: remove socket files, PID files
```

#### `on-teammate-idle.js`

```
Trigger: TeammateIdle
Actions:
  1. Notify('subagent_done')
  (This fires when a subagent like research-mate finishes)
```

---

## 7. Slash Commands

### 7.1 `/focus` — Focus Mode Switcher

```markdown
# /focus Command

Switch between focus mode presets or turn off all features.

## Usage
- `/focus deep`  — Deep work mode: lo-fi, SFX only, pomodoro auto-start
- `/focus write` — Writing mode: jazz + rain, gentle TTS
- `/focus chill` — Chill mode: nature sounds, full notifications
- `/focus off`   — Stop BGM, disable notifications

## Implementation
Read focus_modes from config, apply:
  1. Switch BGM mode and volume
  2. Toggle TTS enabled/disabled
  3. Set pomodoro behavior
Confirm mode switch via notification.
```

### 7.2 `/music` — Music Control

```markdown
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
Parse subcommand, call BGMManager methods accordingly.
If URL provided, validate it looks like a YouTube URL or file path.
```

### 7.3 `/timer` — Pomodoro Timer

```markdown
# /timer Command

Manage pomodoro work/break timer.

## Usage
- `/timer start`         — Start a 25-min work session
- `/timer stop`          — Stop the timer
- `/timer skip`          — Skip to next phase
- `/timer pause`         — Pause the timer
- `/timer resume`        — Resume the timer
- `/timer status`        — Show current timer state
- `/timer config <k> <v>`— Adjust settings (e.g., work_minutes 50)

## Implementation
Communicate with pomodoro daemon via PID file and status file.
Start spawns a new daemon if not running.
Status reads /tmp/cfm-pomodoro-status.json.
```

### 7.4 `/mate` — AI Research Companion

```markdown
# /mate Command

Dispatch background research tasks to a subagent.

## Usage
- `/mate research <topic>` — Start background research on a topic

## Implementation
Launches the research-mate subagent with the given topic.
The subagent runs in a separate context, performs web search and
summarization, and saves results to a temp file.
When done, TeammateIdle hook fires → notification plays.
The user can then ask Claude about the research results.
```

---

## 8. Subagent: Research Mate

### 8.1 Agent Definition (`agents/research-mate.md`)

```markdown
# Research Mate Agent

You are a background research assistant. Your job is to:

1. Research the given topic thoroughly
2. Summarize findings in a clear, structured format
3. Save results where the main session can access them

## Guidelines
- Focus on practical, actionable information
- Prioritize recent sources (last 12 months)
- Keep summaries concise: max 500 words
- Include source URLs for verification
- Save output to /tmp/cfm-research-output.md

## Output Format
# Research: {topic}

## Key Findings
- Finding 1
- Finding 2
- ...

## Summary
Brief paragraph summarizing the most important takeaways.

## Sources
- [Title](URL)
- ...
```

---

## 9. Setup & Dependencies

### 9.1 Required Dependencies

| Dependency | Purpose | Install |
|-----------|---------|---------|
| Node.js ≥ 18 | Plugin runtime | Pre-installed with Claude Code |
| mpv | Audio playback | `brew install mpv` / `apt install mpv` |
| yt-dlp | YouTube stream extraction | `brew install yt-dlp` / `pip install yt-dlp` |
| socat | mpv IPC communication | `brew install socat` / `apt install socat` |

### 9.2 Optional Dependencies (per TTS engine)

| Engine | Install |
|--------|---------|
| edge-tts | `pip install edge-tts` |
| ElevenLabs | API key required, no local install |
| Coqui TTS | `pip install TTS` |
| espeak-ng | `brew install espeak` / `apt install espeak-ng` |

### 9.3 Setup Script (`scripts/cli/setup.js`)

```
Actions:
  1. Check for required dependencies (mpv, yt-dlp, socat)
  2. Check for at least one TTS engine
  3. Create config directory (~/.claude/.chill-focus-mate/)
  4. Copy default config if user config doesn't exist
  5. Create TTS cache directory
  6. Test audio playback with a short test sound
  7. Report status and any missing optional dependencies
```

### 9.4 Plugin Installation

```bash
# From marketplace (when published)
/plugin install chill-focus-mate

# From GitHub
/plugin install chill-focus-mate@username/chill-focus-mate

# Local development
claude --plugin-dir ./chill-focus-mate
```

---

## 10. Event → Notification Map

| Event | SFX File | TTS Message (en) | TTS Message (ko) |
|-------|----------|-------------------|-------------------|
| Session start | `chime-soft.wav` | "Let's get started." | "같이 시작해볼까?" |
| Git commit (success) | `success.wav` | *(none)* | *(none)* |
| Git push (success) | `success-big.wav` | "Push complete." | "푸시 완료!" |
| Test failure | `warn-soft.wav` | "{count} tests failed." | "테스트 {count}개 실패했어." |
| Build success | `success.wav` | "Build complete, no errors." | "빌드 끝났어, 에러 없어." |
| Build failure | `error.wav` | "Build failed. Check the output." | "빌드 실패했어. 확인해봐." |
| Lint error | `warn-soft.wav` | *(none)* | *(none)* |
| Subagent done | `knock.wav` | "Research is ready." | "리서치 정리해뒀어." |
| Pomodoro end | `bell.wav` | "25 minutes up. Take a break." | "25분 지났어, 쉬어가자." |
| Pomodoro 5-min warning | `tick.wav` | "5 minutes left." | "5분 남았어." |
| Break end | `bell-soft.wav` | "Break's over. Ready to continue?" | "다시 시작할까?" |
| Task completed | `success.wav` | "Task done." | "작업 끝났어." |
| Session end | `chime-soft.wav` | "Good work today." | "오늘 수고했어." |
| Generic error | `error.wav` | "An error occurred." | "에러 발생했어." |

---

## 11. Implementation Order

### Phase 1: Core Foundation
1. Project scaffolding (package.json, plugin.json, directory structure)
2. `config.js` — Config loader with defaults and merging
3. `bgm.js` — mpv process management and IPC
4. `/music` command — Basic BGM control

### Phase 2: Notifications
5. `tts.js` — Multi-engine TTS with caching
6. `notify.js` — Ducking + SFX + TTS orchestration
7. Hook handlers — SessionStart, PostToolUse (Bash), Stop
8. Sound effect files — Source or generate .wav files

### Phase 3: Pomodoro & Focus
9. `pomodoro.js` — Timer daemon with notifications
10. `/timer` command
11. `/focus` command — Mode presets
12. Music override during breaks

### Phase 4: AI Companion
13. `research-mate` subagent definition
14. `/mate` command
15. TeammateIdle hook handler

### Phase 5: Polish
16. `setup.js` — Dependency checker and onboarding
17. `reset.js` — Process cleanup utility
18. Error handling hardening
19. README.md with installation and usage guide
20. Publish to plugin marketplace

---

## 12. Technical Notes

### 12.1 mpv IPC via socat

```bash
# Send command
echo '{"command":["set_property","volume",30]}' | socat - /tmp/cfm-bgm-socket

# Read response
echo '{"command":["get_property","volume"]}' | socat - /tmp/cfm-bgm-socket
# Response: {"data":30.0,"error":"success"}
```

In Node.js, use `net.connect()` for the Unix socket instead of shelling out to socat for better performance:

```javascript
const net = require('net');

function sendMpvCommand(socketPath, command) {
  return new Promise((resolve, reject) => {
    const client = net.connect(socketPath);
    let data = '';
    client.on('data', chunk => data += chunk);
    client.on('end', () => resolve(JSON.parse(data)));
    client.on('error', reject);
    client.write(JSON.stringify({ command }) + '\n');
    // mpv sends response then we can end
    setTimeout(() => client.end(), 100);
  });
}
```

### 12.2 YouTube Playback Considerations

- `yt-dlp` is required for YouTube URL resolution
- mpv calls yt-dlp internally when given a YouTube URL
- Live streams (24/7 radio) work with `--loop=inf` but mpv handles reconnection
- If network drops, mpv will retry; if it fails, BGM stops silently
- **Legal note**: YouTube ToS technically prohibits stream extraction. For personal use this is widely practiced, but the README should include a disclaimer

### 12.3 Cross-Platform Audio

| Platform | mpv | TTS (system) | Notifications |
|----------|-----|-------------|---------------|
| macOS | `brew install mpv` | `say` command | Native via `osascript` |
| Linux | `apt install mpv` | `spd-say` or `pico2wave` | `notify-send` |
| WSL | Requires PulseAudio bridge | `espeak-ng` | Limited |

### 12.4 Sound Effect Files

For the MVP, use royalty-free sounds from:
- [Pixabay Sound Effects](https://pixabay.com/sound-effects/) (free, no attribution required)
- [Freesound.org](https://freesound.org/) (CC0 or CC-BY)
- Generate with `ffmpeg` (simple tones):

```bash
# Generate a simple chime (440Hz, 0.3s, fade out)
ffmpeg -f lavfi -i "sine=frequency=440:duration=0.3" -af "afade=t=out:st=0.1:d=0.2" sounds/chime-soft.wav

# Generate a success sound (two ascending tones)
ffmpeg -f lavfi -i "sine=frequency=523:duration=0.15" -f lavfi -i "sine=frequency=659:duration=0.15" \
  -filter_complex "[0][1]concat=n=2:v=0:a=1,afade=t=out:st=0.2:d=0.1" sounds/success.wav

# Generate a warning tone (lower pitch)
ffmpeg -f lavfi -i "sine=frequency=330:duration=0.4" -af "afade=t=out:st=0.2:d=0.2" sounds/warn-soft.wav
```

---

## 13. package.json

```json
{
  "name": "chill-focus-mate",
  "version": "0.1.0",
  "description": "AI-powered coding companion with ambient music, TTS notifications, and pomodoro timer for Claude Code",
  "main": "scripts/core/config.js",
  "scripts": {
    "setup": "node scripts/cli/setup.js",
    "reset": "node scripts/cli/reset.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "yaml": "^2.4.0"
  },
  "devDependencies": {},
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": [
    "claude-code",
    "plugin",
    "ambient",
    "lofi",
    "focus",
    "pomodoro",
    "tts",
    "productivity"
  ],
  "license": "MIT"
}
```

---

## 14. plugin.json

```json
{
  "name": "chill-focus-mate",
  "version": "0.1.0",
  "description": "Ambient music, TTS notifications, pomodoro timer, and AI research companion for Claude Code",
  "author": "",
  "homepage": "",
  "commands": ["focus", "music", "timer", "mate"],
  "agents": ["research-mate"]
}
```
