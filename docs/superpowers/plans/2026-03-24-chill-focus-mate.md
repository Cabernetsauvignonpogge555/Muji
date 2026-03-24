# Chill Focus Mate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that combines ambient background music (YouTube/local), context-aware audio ducking, TTS/SFX notifications, pomodoro timer, and an AI research subagent into a seamless coding companion.

**Architecture:** Node.js plugin with 5 core modules (config, bgm, tts, notify, pomodoro) orchestrated via Claude Code hooks and slash commands. Audio playback via mpv with IPC control (named pipes on Windows, Unix sockets on macOS/Linux). TTS via multi-engine abstraction with caching. Notifications queue sequentially with BGM ducking.

**Tech Stack:** Node.js >=18, mpv (audio), yt-dlp (YouTube), edge-tts/espeak/system TTS, yaml (npm), Claude Code plugin API (hooks, commands, agents).

**Spec:** `DESIGN.md` in project root.

**Platform note:** Windows uses named pipes (`\\.\pipe\cfm-bgm-socket`) instead of Unix sockets. PID files go to `%TEMP%` on Windows instead of `/tmp/`. The code detects platform and adapts paths accordingly.

---

## File Structure

```
chill-focus-mate/
├── package.json                          # Project metadata & dependencies
├── .claude-plugin/
│   └── plugin.json                       # Claude Code plugin metadata
├── config/
│   └── default.yaml                      # Default configuration (full)
├── scripts/
│   ├── core/
│   │   ├── config.js                     # Config loader: load, merge, validate, dot-notation access
│   │   ├── bgm.js                        # BGM manager: mpv lifecycle, IPC, volume, mode switching
│   │   ├── tts.js                        # TTS engine: multi-engine abstraction, caching, fallback
│   │   ├── notify.js                     # Notifier: ducking + SFX + TTS orchestration, queue
│   │   └── pomodoro.js                   # Pomodoro timer: daemon, work/break cycles, notifications
│   ├── handlers/
│   │   ├── _bootstrap.js                 # Shared handler init: config, bgm, tts, notifier, stdin
│   │   ├── on-session-start.js           # Hook: SessionStart — dep check, auto-start BGM, greeting
│   │   ├── on-bash-complete.js           # Hook: PostToolUse(Bash) — pattern match commands, notify
│   │   ├── on-file-write.js              # Hook: PostToolUse(Write|Edit) — no-op placeholder
│   │   ├── on-task-done.js               # Hook: TaskCompleted — notify task_completed
│   │   ├── on-stop.js                    # Hook: Stop — goodbye, cleanup all processes
│   │   └── on-teammate-idle.js           # Hook: TeammateIdle — notify subagent_done
│   └── cli/
│       ├── setup.js                      # Dependency checker & onboarding wizard
│       └── reset.js                      # Kill all managed processes, cleanup temp files
├── commands/
│   ├── focus.md                          # /focus slash command definition
│   ├── music.md                          # /music slash command definition
│   ├── timer.md                          # /timer slash command definition
│   └── mate.md                           # /mate slash command definition
├── agents/
│   └── research-mate.md                  # Background research subagent definition
├── skills/
│   └── focus-tips.md                     # Contextual productivity tips skill
├── hooks/
│   └── hooks.json                        # All hook definitions
├── sounds/                               # Generated .wav sound effects
│   ├── chime-soft.wav
│   ├── success.wav
│   ├── success-big.wav
│   ├── warn-soft.wav
│   ├── error.wav
│   ├── knock.wav
│   ├── bell.wav
│   ├── bell-soft.wav
│   └── tick.wav
└── tests/
    ├── config.test.js
    ├── bgm.test.js
    ├── tts.test.js
    ├── notify.test.js
    ├── pomodoro.test.js
    └── handlers.test.js
```

---

## Phase 1: Core Foundation

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.claude-plugin/plugin.json`
- Create: `config/default.yaml`

- [ ] **Step 1: Initialize git repo and create package.json**

```bash
cd /c/Users/user/OneDrive/Documents/git-Muji
git init
```

```json
// package.json
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
    "claude-code", "plugin", "ambient", "lofi",
    "focus", "pomodoro", "tts", "productivity"
  ],
  "license": "MIT"
}
```

- [ ] **Step 2: Create plugin.json**

```bash
mkdir -p .claude-plugin
```

```json
// .claude-plugin/plugin.json
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

- [ ] **Step 3: Create default.yaml**

Copy the full default configuration from DESIGN.md Section 4.2 into `config/default.yaml`. This is the complete YAML config with all sections: language, tts, bgm, sfx, notifications, pomodoro, focus_modes, advanced.

**Important:** Add these missing entries to the `sfx.events` section in `default.yaml`:
```yaml
    task_completed: success.wav
    session_end: chime-soft.wav
```
These are listed in the Event Map (DESIGN.md Section 10) but were omitted from the config template.

**Platform adaptation:** In the `advanced` and `bgm.mpv` sections, paths must be cross-platform:
- `socket_path`: Use `/tmp/cfm-bgm-socket` on Unix, `\\.\pipe\cfm-bgm-socket` on Windows
- `pid_file`: Use `/tmp/cfm-pomodoro.pid` on Unix, `%TEMP%/cfm-pomodoro.pid` on Windows
- These are resolved at runtime by config.js, so the YAML stores the Unix defaults.

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .claude-plugin/plugin.json config/default.yaml DESIGN.md
git commit -m "chore: scaffold project with package.json, plugin.json, default config"
```

---

### Task 2: Config Loader (`scripts/core/config.js`)

**Files:**
- Create: `scripts/core/config.js`
- Create: `tests/config.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/config.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

describe('Config', () => {
  it('loads default config from config/default.yaml', () => {
    const Config = require('../scripts/core/config.js');
    const config = new Config();
    const cfg = config.load();

    assert.strictEqual(cfg.language, 'en');
    assert.strictEqual(cfg.bgm.enabled, true);
    assert.strictEqual(cfg.bgm.default_mode, 'lofi');
    assert.strictEqual(cfg.bgm.volume, 30);
    assert.strictEqual(cfg.tts.engine, 'edge-tts');
    assert.strictEqual(cfg.pomodoro.work_minutes, 25);
  });

  it('supports dot-notation get()', () => {
    const Config = require('../scripts/core/config.js');
    const config = new Config();
    config.load();

    assert.strictEqual(config.get('tts.engine'), 'edge-tts');
    assert.strictEqual(config.get('bgm.volume'), 30);
    assert.strictEqual(config.get('pomodoro.short_break_minutes'), 5);
  });

  it('returns correct language', () => {
    const Config = require('../scripts/core/config.js');
    const config = new Config();
    config.load();

    assert.strictEqual(config.getLanguage(), 'en');
  });

  it('returns BGM sources for a mode', () => {
    const Config = require('../scripts/core/config.js');
    const config = new Config();
    config.load();

    const sources = config.getBGMSources('lofi');
    assert.ok(Array.isArray(sources));
    assert.ok(sources.length > 0);
    assert.ok(sources[0].includes('youtube.com'));
  });

  it('returns SFX path for an event', () => {
    const Config = require('../scripts/core/config.js');
    const config = new Config();
    config.load();

    const sfxPath = config.getSFXPath('session_start');
    assert.ok(sfxPath.endsWith('chime-soft.wav'));
  });

  it('resolves notification messages with variables', () => {
    const Config = require('../scripts/core/config.js');
    const config = new Config();
    config.load();

    const msg = config.getMessage('test_fail', 'en', { count: 3 });
    assert.strictEqual(msg, '3 tests failed.');

    const msgKo = config.getMessage('test_fail', 'ko', { count: 3 });
    assert.strictEqual(msgKo, '테스트 3개 실패했어.');
  });

  it('returns null message when template is null', () => {
    const Config = require('../scripts/core/config.js');
    const config = new Config();
    config.load();

    const msg = config.getMessage('commit_success', 'en', {});
    assert.strictEqual(msg, null);
  });

  it('returns platform-appropriate socket path', () => {
    const Config = require('../scripts/core/config.js');
    const config = new Config();
    config.load();

    const socketPath = config.getSocketPath();
    if (process.platform === 'win32') {
      assert.ok(socketPath.includes('\\\\.\\pipe\\'));
    } else {
      assert.ok(socketPath.startsWith('/tmp/'));
    }
  });

  it('returns platform-appropriate temp paths', () => {
    const Config = require('../scripts/core/config.js');
    const config = new Config();
    config.load();

    const pidPath = config.getPidPath();
    assert.ok(pidPath.includes('cfm-pomodoro'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/config.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement config.js**

```javascript
// scripts/core/config.js
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const YAML = require('yaml');

class Config {
  constructor() {
    this._config = null;
    this._pluginDir = path.resolve(__dirname, '..', '..');
  }

  load() {
    const defaults = this._loadDefault();
    const user = this._loadUser();
    this._config = user ? this._merge(defaults, user) : defaults;
    this._validate(this._config);
    return this._config;
  }

  get(dotPath) {
    if (!this._config) this.load();
    return dotPath.split('.').reduce((obj, key) => obj?.[key], this._config);
  }

  getLanguage() {
    return this.get('language') || 'en';
  }

  getTTSVoice(engine, lang) {
    const voices = this.get(`tts.engines.${engine}.voices`);
    if (!voices) return null;
    return voices[lang] || voices['en'] || null;
  }

  getBGMSources(mode) {
    const modeConfig = this.get(`bgm.modes.${mode}`);
    return modeConfig?.sources || [];
  }

  getSFXPath(event) {
    const filename = this.get(`sfx.events.${event}`);
    if (!filename) return null;
    return path.join(this._pluginDir, 'sounds', filename);
  }

  getMessage(event, lang, vars = {}) {
    const messages = this.get(`notifications.messages.${event}`);
    if (!messages) return null;
    const template = messages[lang] ?? messages['en'] ?? null;
    if (template === null) return null;
    return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
  }

  getSocketPath() {
    if (process.platform === 'win32') {
      return '\\\\.\\pipe\\cfm-bgm-socket';
    }
    return this.get('bgm.mpv.socket_path') || '/tmp/cfm-bgm-socket';
  }

  getPidPath() {
    const tmpDir = process.platform === 'win32' ? os.tmpdir() : '/tmp';
    return path.join(tmpDir, 'cfm-pomodoro.pid');
  }

  getStatusPath() {
    const tmpDir = process.platform === 'win32' ? os.tmpdir() : '/tmp';
    return path.join(tmpDir, 'cfm-pomodoro-status.json');
  }

  getPluginDir() {
    return this._pluginDir;
  }

  _validate(config) {
    const required = ['language', 'tts', 'bgm', 'sfx', 'notifications', 'pomodoro'];
    for (const key of required) {
      if (!config[key]) {
        console.warn(`[CFM] Config missing required section: ${key}`);
      }
    }
    if (config.bgm?.volume !== undefined) {
      if (config.bgm.volume < 0 || config.bgm.volume > 100) {
        console.warn('[CFM] bgm.volume must be 0-100, clamping');
        config.bgm.volume = Math.max(0, Math.min(100, config.bgm.volume));
      }
    }
  }

  _loadDefault() {
    const defaultPath = path.join(this._pluginDir, 'config', 'default.yaml');
    const content = fs.readFileSync(defaultPath, 'utf8');
    return YAML.parse(content);
  }

  _loadUser() {
    const home = os.homedir();
    const userPath = path.join(home, '.claude', '.chill-focus-mate', 'config.yaml');
    if (!fs.existsSync(userPath)) return null;
    const content = fs.readFileSync(userPath, 'utf8');
    return YAML.parse(content);
  }

  _merge(defaults, user) {
    return this._deepMerge(defaults, user);
  }

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = this._deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
}

module.exports = Config;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/config.test.js
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/core/config.js tests/config.test.js
git commit -m "feat: add config loader with YAML parsing, dot-notation access, platform paths"
```

---

### Task 3: BGM Manager (`scripts/core/bgm.js`)

**Files:**
- Create: `scripts/core/bgm.js`
- Create: `tests/bgm.test.js`

- [ ] **Step 1: Write the failing test**

Tests for BGM manager focus on the logic layer (mode resolution, state tracking), not actual mpv spawning (which requires mpv installed).

```javascript
// tests/bgm.test.js
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock config for testing without mpv
function createMockConfig() {
  return {
    get: (path) => {
      const data = {
        'bgm.enabled': true,
        'bgm.default_mode': 'lofi',
        'bgm.volume': 30,
        'bgm.mpv.extra_args': ['--no-video', '--really-quiet', '--loop=inf'],
      };
      return data[path];
    },
    getBGMSources: (mode) => {
      const sources = {
        lofi: ['https://www.youtube.com/watch?v=jfKfPfyJRdk'],
        jazz: ['https://www.youtube.com/watch?v=rUxyKA_-grg'],
        silence: [],
      };
      return sources[mode] || [];
    },
    getSocketPath: () => '\\\\.\\pipe\\cfm-bgm-test',
    getPluginDir: () => __dirname,
  };
}

describe('BGMManager', () => {
  it('initializes with correct defaults', () => {
    const BGMManager = require('../scripts/core/bgm.js');
    const mgr = new BGMManager(createMockConfig());

    assert.strictEqual(mgr.isPlaying(), false);
    assert.strictEqual(mgr._currentMode, null);
    assert.strictEqual(mgr._volume, 30);
  });

  it('resolves sources for a mode', () => {
    const BGMManager = require('../scripts/core/bgm.js');
    const mgr = new BGMManager(createMockConfig());

    const sources = mgr._resolveSources('lofi');
    assert.ok(sources.length > 0);
  });

  it('returns empty sources for silence mode', () => {
    const BGMManager = require('../scripts/core/bgm.js');
    const mgr = new BGMManager(createMockConfig());

    const sources = mgr._resolveSources('silence');
    assert.strictEqual(sources.length, 0);
  });

  it('tracks volume changes internally', () => {
    const BGMManager = require('../scripts/core/bgm.js');
    const mgr = new BGMManager(createMockConfig());
    mgr._volume = 50;

    assert.strictEqual(mgr.getVolume(), 50);
  });

  it('clamps volume to 0-100 range', () => {
    const BGMManager = require('../scripts/core/bgm.js');
    const mgr = new BGMManager(createMockConfig());

    assert.strictEqual(mgr._clampVolume(150), 100);
    assert.strictEqual(mgr._clampVolume(-10), 0);
    assert.strictEqual(mgr._clampVolume(50), 50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/bgm.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement bgm.js**

```javascript
// scripts/core/bgm.js
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');

class BGMManager {
  constructor(config) {
    this._config = config;
    this._process = null;
    this._currentMode = null;
    this._volume = config.get('bgm.volume') || 30;
    this._socketPath = config.getSocketPath();
    this._restartAttempted = false;
  }

  async start(mode) {
    if (!this._config.get('bgm.enabled')) return;
    mode = mode || this._config.get('bgm.default_mode');
    const sources = this._resolveSources(mode);
    if (sources.length === 0) {
      this._currentMode = mode;
      return; // silence mode
    }
    await this.stop();
    await this._spawnMpv(sources[0]);
    this._currentMode = mode;
  }

  async stop() {
    if (this._process) {
      this._process.kill();
      this._process = null;
    }
    this._currentMode = null;
    this._cleanup();
  }

  async switchMode(mode) {
    await this.stop();
    await this.start(mode);
  }

  async playUrl(url) {
    await this.stop();
    await this._spawnMpv(url);
    this._currentMode = 'custom';
  }

  async setVolume(level) {
    this._volume = this._clampVolume(level);
    if (this._process) {
      await this._sendIPC(['set_property', 'volume', this._volume]);
    }
  }

  getVolume() {
    return this._volume;
  }

  async fadeVolume(target, durationMs) {
    target = this._clampVolume(target);
    const steps = 10;
    const stepDuration = durationMs / steps;
    const current = this._volume;
    const diff = target - current;

    for (let i = 1; i <= steps; i++) {
      const vol = Math.round(current + (diff * i) / steps);
      await this.setVolume(vol);
      await this._sleep(stepDuration);
    }
  }

  async pause() {
    if (this._process) {
      await this._sendIPC(['set_property', 'pause', true]);
    }
  }

  async resume() {
    if (this._process) {
      await this._sendIPC(['set_property', 'pause', false]);
    }
  }

  isPlaying() {
    return this._process !== null && !this._process.killed;
  }

  _resolveSources(mode) {
    return this._config.getBGMSources(mode) || [];
  }

  _clampVolume(vol) {
    return Math.max(0, Math.min(100, Math.round(vol)));
  }

  async _spawnMpv(source) {
    const extraArgs = this._config.get('bgm.mpv.extra_args') || [];
    const args = [
      ...extraArgs,
      `--volume=${this._volume}`,
      `--input-ipc-server=${this._socketPath}`,
      source,
    ];

    return new Promise((resolve, reject) => {
      try {
        this._process = spawn('mpv', args, {
          stdio: 'ignore',
          detached: false,
        });

        this._process.on('error', (err) => {
          console.error('[CFM] mpv error:', err.message);
          this._process = null;
          if (!this._restartAttempted) {
            this._restartAttempted = true;
            console.warn('[CFM] Attempting mpv restart...');
            this._spawnMpv(source).catch(() => {
              console.error('[CFM] mpv restart failed. BGM disabled.');
            });
          }
        });

        this._process.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            console.warn(`[CFM] mpv exited with code ${code}`);
          }
          this._process = null;
        });

        // Give mpv a moment to start and open the IPC socket
        setTimeout(resolve, 500);
      } catch (err) {
        console.error('[CFM] Failed to spawn mpv:', err.message);
        reject(err);
      }
    });
  }

  async _sendIPC(command) {
    return new Promise((resolve, reject) => {
      const client = net.connect(this._socketPath);
      let data = '';

      client.on('connect', () => {
        client.write(JSON.stringify({ command }) + '\n');
      });

      client.on('data', (chunk) => {
        data += chunk;
        try {
          const parsed = JSON.parse(data);
          client.end();
          resolve(parsed);
        } catch {
          // wait for more data
        }
      });

      client.on('error', (err) => {
        resolve(null); // don't fail on IPC errors
      });

      client.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch {
          resolve(null);
        }
      });

      setTimeout(() => {
        client.destroy();
        resolve(null);
      }, 2000);
    });
  }

  _cleanup() {
    // On Unix, remove socket file. On Windows, named pipes are auto-cleaned.
    if (process.platform !== 'win32') {
      try {
        fs.unlinkSync(this._socketPath);
      } catch {
        // ignore
      }
    }
  }

  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

module.exports = BGMManager;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/bgm.test.js
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/core/bgm.js tests/bgm.test.js
git commit -m "feat: add BGM manager with mpv IPC, volume control, mode switching"
```

---

### Task 4: `/music` Slash Command

**Files:**
- Create: `commands/music.md`

- [ ] **Step 1: Write the command definition**

```markdown
<!-- commands/music.md -->
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
```

- [ ] **Step 2: Commit**

```bash
git add commands/music.md
git commit -m "feat: add /music slash command definition"
```

---

## Phase 2: Notifications

### Task 5: TTS Engine (`scripts/core/tts.js`)

**Files:**
- Create: `scripts/core/tts.js`
- Create: `tests/tts.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/tts.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const crypto = require('node:crypto');

function createMockConfig() {
  return {
    get: (p) => {
      const data = {
        'tts.engine': 'edge-tts',
        'tts.fallback_engine': 'system',
        'tts.cache_enabled': true,
        'tts.cache_dir': path.join(__dirname, '.test-tts-cache'),
        'tts.cache_max_mb': 200,
      };
      return data[p];
    },
    getTTSVoice: (engine, lang) => {
      const voices = {
        'edge-tts': { en: 'en-US-AriaNeural', ko: 'ko-KR-SunHiNeural' },
        espeak: { en: 'en', ko: 'ko' },
        system: { en: 'Samantha', ko: 'Yuna' },
      };
      return voices[engine]?.[lang] || null;
    },
    getLanguage: () => 'en',
  };
}

describe('TTSEngine', () => {
  it('generates a consistent cache key for same input', () => {
    const TTSEngine = require('../scripts/core/tts.js');
    const tts = new TTSEngine(createMockConfig());

    const key1 = tts._cacheKey('Hello', 'edge-tts', 'en-US-AriaNeural');
    const key2 = tts._cacheKey('Hello', 'edge-tts', 'en-US-AriaNeural');
    assert.strictEqual(key1, key2);
  });

  it('generates different cache keys for different text', () => {
    const TTSEngine = require('../scripts/core/tts.js');
    const tts = new TTSEngine(createMockConfig());

    const key1 = tts._cacheKey('Hello', 'edge-tts', 'en-US-AriaNeural');
    const key2 = tts._cacheKey('World', 'edge-tts', 'en-US-AriaNeural');
    assert.notStrictEqual(key1, key2);
  });

  it('resolves voice for engine and language', () => {
    const TTSEngine = require('../scripts/core/tts.js');
    const tts = new TTSEngine(createMockConfig());

    assert.strictEqual(tts._resolveVoice('edge-tts', 'en'), 'en-US-AriaNeural');
    assert.strictEqual(tts._resolveVoice('edge-tts', 'ko'), 'ko-KR-SunHiNeural');
  });

  it('builds correct edge-tts command', () => {
    const TTSEngine = require('../scripts/core/tts.js');
    const tts = new TTSEngine(createMockConfig());

    const cmd = tts._buildCommand('edge-tts', 'Hello world', 'en-US-AriaNeural', '/tmp/out.mp3');
    assert.ok(cmd.includes('edge-tts'));
    assert.ok(cmd.includes('--voice'));
    assert.ok(cmd.includes('en-US-AriaNeural'));
    assert.ok(cmd.includes('--text'));
  });

  it('builds correct espeak command', () => {
    const TTSEngine = require('../scripts/core/tts.js');
    const tts = new TTSEngine(createMockConfig());

    const cmd = tts._buildCommand('espeak', 'Hello', 'en', '/tmp/out.wav');
    assert.ok(cmd.includes('espeak-ng') || cmd.includes('espeak'));
    assert.ok(cmd.includes('-v en'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/tts.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement tts.js**

```javascript
// scripts/core/tts.js
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

class TTSEngine {
  constructor(config) {
    this._config = config;
    this._engine = config.get('tts.engine') || 'edge-tts';
    this._fallback = config.get('tts.fallback_engine') || 'system';
    this._cacheEnabled = config.get('tts.cache_enabled') !== false;
    this._cacheDir = config.get('tts.cache_dir')?.replace('~', os.homedir())
      || path.join(os.homedir(), '.claude', '.chill-focus-mate', 'tts-cache');
    this._cacheMaxMb = config.get('tts.cache_max_mb') || 200;
  }

  async synthesize(text, lang) {
    lang = lang || this._config.getLanguage();
    const voice = this._resolveVoice(this._engine, lang);

    // Check cache
    if (this._cacheEnabled) {
      const cached = this._getCachedPath(text, this._engine, voice);
      if (cached) return cached;
    }

    const ext = this._engine === 'espeak' ? 'wav' : 'mp3';
    const outPath = path.join(os.tmpdir(), `cfm-tts-${Date.now()}.${ext}`);

    try {
      const cmd = this._buildCommand(this._engine, text, voice, outPath);
      execSync(cmd, { timeout: 15000, stdio: 'pipe' });

      if (this._cacheEnabled && fs.existsSync(outPath)) {
        this._saveToCache(outPath, text, this._engine, voice);
      }
      return outPath;
    } catch (err) {
      console.warn(`[CFM] TTS engine '${this._engine}' failed:`, err.message);
      // Try fallback
      if (this._fallback && this._fallback !== this._engine) {
        const fbVoice = this._resolveVoice(this._fallback, lang);
        try {
          const cmd = this._buildCommand(this._fallback, text, fbVoice, outPath);
          execSync(cmd, { timeout: 15000, stdio: 'pipe' });
          return outPath;
        } catch (fbErr) {
          console.error(`[CFM] Fallback TTS '${this._fallback}' also failed:`, fbErr.message);
        }
      }
      return null;
    }
  }

  async getAvailableEngines() {
    const engines = [];
    const checks = {
      'edge-tts': 'edge-tts --help',
      espeak: process.platform === 'win32' ? 'espeak-ng --help' : 'espeak-ng --help',
      system: process.platform === 'darwin' ? 'which say' : 'which spd-say',
    };

    for (const [name, cmd] of Object.entries(checks)) {
      try {
        execSync(cmd, { stdio: 'pipe', timeout: 5000 });
        engines.push(name);
      } catch {
        // not available
      }
    }
    return engines;
  }

  async testEngine(engine) {
    const testText = 'test';
    const outPath = path.join(os.tmpdir(), `cfm-tts-test-${Date.now()}.mp3`);
    const voice = this._resolveVoice(engine, 'en');
    try {
      const cmd = this._buildCommand(engine, testText, voice, outPath);
      execSync(cmd, { timeout: 10000, stdio: 'pipe' });
      const exists = fs.existsSync(outPath);
      try { fs.unlinkSync(outPath); } catch { /* ignore */ }
      return exists;
    } catch {
      return false;
    }
  }

  _resolveVoice(engine, lang) {
    return this._config.getTTSVoice(engine, lang) || lang;
  }

  _buildCommand(engine, text, voice, outPath) {
    // Escape text for shell
    const safeText = text.replace(/"/g, '\\"').replace(/\$/g, '\\$');

    switch (engine) {
      case 'edge-tts':
        return `edge-tts --voice "${voice}" --text "${safeText}" --write-media "${outPath}"`;

      case 'elevenlabs': {
        const apiKey = this._config.get('tts.engines.elevenlabs.api_key')
          || process.env.ELEVENLABS_API_KEY || '';
        const voiceId = voice || this._config.get('tts.engines.elevenlabs.voice_id') || '';
        const modelId = this._config.get('tts.engines.elevenlabs.model_id') || 'eleven_flash_v2_5';
        return `curl -s -X POST "https://api.elevenlabs.io/v1/text-to-speech/${voiceId}" `
          + `-H "xi-api-key: ${apiKey}" `
          + `-H "Content-Type: application/json" `
          + `-d '{"text":"${safeText}","model_id":"${modelId}"}' `
          + `--output "${outPath}"`;
      }

      case 'coqui': {
        const model = this._config.get('tts.engines.coqui.model') || 'tts_models/en/ljspeech/tacotron2-DDC';
        return `tts --text "${safeText}" --model_name "${model}" --out_path "${outPath}"`;
      }

      case 'espeak':
        return `espeak-ng -v ${voice} -w "${outPath}" "${safeText}"`;

      case 'system':
        if (process.platform === 'darwin') {
          const aiffPath = outPath.replace(/\.\w+$/, '.aiff');
          return `say -v "${voice}" -o "${aiffPath}" "${safeText}" && ffmpeg -y -i "${aiffPath}" "${outPath}" 2>/dev/null && rm -f "${aiffPath}"`;
        }
        // Linux: pico2wave or spd-say (spd-say can't output to file, so use pico2wave)
        return `pico2wave -l ${voice} -w "${outPath}" "${safeText}" 2>/dev/null || espeak-ng -v ${voice} -w "${outPath}" "${safeText}"`;

      default:
        throw new Error(`Unknown TTS engine: ${engine}`);
    }
  }

  _cacheKey(text, engine, voice) {
    return crypto.createHash('sha256').update(`${engine}:${voice}:${text}`).digest('hex');
  }

  _getCachedPath(text, engine, voice) {
    const hash = this._cacheKey(text, engine, voice);
    const dir = this._cacheDir;
    // Check for any extension
    for (const ext of ['mp3', 'wav', 'aiff']) {
      const p = path.join(dir, `${hash}.${ext}`);
      if (fs.existsSync(p)) {
        // Touch file for LRU
        const now = new Date();
        fs.utimesSync(p, now, now);
        return p;
      }
    }
    return null;
  }

  _saveToCache(audioPath, text, engine, voice) {
    const hash = this._cacheKey(text, engine, voice);
    const ext = path.extname(audioPath);
    const dest = path.join(this._cacheDir, `${hash}${ext}`);
    try {
      fs.mkdirSync(this._cacheDir, { recursive: true });
      fs.copyFileSync(audioPath, dest);
      this._cleanCache();
    } catch (err) {
      console.warn('[CFM] Cache save failed:', err.message);
    }
  }

  _cleanCache() {
    try {
      const files = fs.readdirSync(this._cacheDir)
        .map((f) => {
          const fp = path.join(this._cacheDir, f);
          const stat = fs.statSync(fp);
          return { path: fp, size: stat.size, mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime); // newest first

      let totalBytes = files.reduce((s, f) => s + f.size, 0);
      const maxBytes = this._cacheMaxMb * 1024 * 1024;

      // Remove oldest files until under limit
      while (totalBytes > maxBytes && files.length > 0) {
        const old = files.pop();
        fs.unlinkSync(old.path);
        totalBytes -= old.size;
      }
    } catch {
      // ignore cache cleanup errors
    }
  }
}

module.exports = TTSEngine;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/tts.test.js
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/core/tts.js tests/tts.test.js
git commit -m "feat: add multi-engine TTS abstraction with caching and fallback"
```

---

### Task 6: Notifier (`scripts/core/notify.js`)

**Files:**
- Create: `scripts/core/notify.js`
- Create: `tests/notify.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/notify.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');

function createMockConfig() {
  return {
    get: (p) => {
      const data = {
        'notifications.enabled': true,
        'notifications.ducking.enabled': true,
        'notifications.ducking.duck_volume': 10,
        'notifications.ducking.fade_duration_ms': 100,
        'sfx.enabled': true,
        'sfx.volume': 80,
      };
      return data[p];
    },
    getSFXPath: (event) => {
      const map = { session_start: '/mock/chime-soft.wav', test_fail: '/mock/warn-soft.wav' };
      return map[event] || null;
    },
    getMessage: (event, lang, vars) => {
      if (event === 'session_start') return "Let's get started.";
      if (event === 'test_fail') return `${vars.count} tests failed.`;
      if (event === 'commit_success') return null;
      return null;
    },
    getLanguage: () => 'en',
  };
}

function createMockBGM() {
  const calls = [];
  return {
    calls,
    getVolume: () => 30,
    setVolume: async (v) => calls.push({ method: 'setVolume', args: [v] }),
    fadeVolume: async (target, dur) => calls.push({ method: 'fadeVolume', args: [target, dur] }),
    isPlaying: () => true,
  };
}

function createMockTTS() {
  const calls = [];
  return {
    calls,
    synthesize: async (text, lang) => {
      calls.push({ method: 'synthesize', args: [text, lang] });
      return '/mock/tts-output.mp3';
    },
  };
}

describe('Notifier', () => {
  it('resolves message templates with variables', () => {
    const Notifier = require('../scripts/core/notify.js');
    const notifier = new Notifier(createMockConfig(), createMockBGM(), createMockTTS());

    const msg = notifier._resolveMessage('test_fail', { count: 3 });
    assert.strictEqual(msg, '3 tests failed.');
  });

  it('returns null for events with null message', () => {
    const Notifier = require('../scripts/core/notify.js');
    const notifier = new Notifier(createMockConfig(), createMockBGM(), createMockTTS());

    const msg = notifier._resolveMessage('commit_success', {});
    assert.strictEqual(msg, null);
  });

  it('queues notifications sequentially', async () => {
    const Notifier = require('../scripts/core/notify.js');
    const bgm = createMockBGM();
    const tts = createMockTTS();
    // Override _playSFX and _playAudio to no-op for test
    const notifier = new Notifier(createMockConfig(), bgm, tts);
    notifier._playSFX = async () => {};
    notifier._playAudio = async () => {};

    // Queue two notifications
    const p1 = notifier.notify('session_start');
    const p2 = notifier.notify('test_fail', { count: 2 });

    await p1;
    await p2;

    // TTS should have been called for session_start (has message)
    // and test_fail (has message)
    assert.strictEqual(tts.calls.length, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/notify.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement notify.js**

```javascript
// scripts/core/notify.js
const { spawn } = require('node:child_process');
const fs = require('node:fs');

class Notifier {
  constructor(config, bgmManager, ttsEngine) {
    this._config = config;
    this._bgm = bgmManager;
    this._tts = ttsEngine;
    this._queue = Promise.resolve();
  }

  async notify(event, vars = {}) {
    if (!this._config.get('notifications.enabled')) return;

    const sfxPath = this._config.getSFXPath(event);
    const message = this._resolveMessage(event, vars);

    if (!sfxPath && !message) return;

    return this._queueNotification(async () => {
      await this._duckAndRestore(async () => {
        if (sfxPath && fs.existsSync(sfxPath)) {
          await this._playSFX(sfxPath);
        }
        if (message) {
          const lang = this._config.getLanguage();
          const audioFile = await this._tts.synthesize(message, lang);
          if (audioFile) {
            await this._playAudio(audioFile);
          }
        }
      });
    });
  }

  async playSFX(soundFile) {
    if (!this._config.get('sfx.enabled')) return;
    await this._playSFX(soundFile);
  }

  async speak(text, lang) {
    lang = lang || this._config.getLanguage();
    const audioFile = await this._tts.synthesize(text, lang);
    if (audioFile) {
      await this._playAudio(audioFile);
    }
  }

  _resolveMessage(event, vars) {
    const lang = this._config.getLanguage();
    return this._config.getMessage(event, lang, vars);
  }

  async _duckAndRestore(callback) {
    const duckingEnabled = this._config.get('notifications.ducking.enabled');
    const bgmPlaying = this._bgm.isPlaying();

    if (!duckingEnabled || !bgmPlaying) {
      await callback();
      return;
    }

    const duckVolume = this._config.get('notifications.ducking.duck_volume') || 10;
    const fadeDuration = this._config.get('notifications.ducking.fade_duration_ms') || 300;
    const originalVolume = this._bgm.getVolume();

    // Duck
    await this._bgm.fadeVolume(duckVolume, fadeDuration);

    try {
      await callback();
    } finally {
      // Restore
      await this._bgm.fadeVolume(originalVolume, fadeDuration);
    }
  }

  _queueNotification(fn) {
    this._queue = this._queue
      .then(() => fn())
      .catch((err) => console.error('[CFM] Notification failed:', err.message));
    return this._queue;
  }

  async _playSFX(filePath) {
    const volume = this._config.get('sfx.volume') || 80;
    return this._playAudio(filePath, volume);
  }

  async _playAudio(filePath, volume) {
    return new Promise((resolve) => {
      const args = ['--no-video', '--really-quiet'];
      if (volume !== undefined) {
        args.push(`--volume=${volume}`);
      }
      args.push(filePath);

      const proc = spawn('mpv', args, { stdio: 'ignore' });

      proc.on('exit', resolve);
      proc.on('error', (err) => {
        console.warn('[CFM] Audio playback error:', err.message);
        resolve();
      });

      // Safety timeout: don't block queue forever
      setTimeout(() => {
        proc.kill();
        resolve();
      }, 30000);
    });
  }
}

module.exports = Notifier;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/notify.test.js
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/core/notify.js tests/notify.test.js
git commit -m "feat: add notifier with ducking, SFX, TTS orchestration, sequential queue"
```

---

### Task 7: Hook Handlers

**Files:**
- Create: `hooks/hooks.json`
- Create: `scripts/handlers/on-session-start.js`
- Create: `scripts/handlers/on-bash-complete.js`
- Create: `scripts/handlers/on-file-write.js`
- Create: `scripts/handlers/on-task-done.js`
- Create: `scripts/handlers/on-stop.js`
- Create: `scripts/handlers/on-teammate-idle.js`
- Create: `tests/handlers.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/handlers.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('on-bash-complete pattern matching', () => {
  // Test the pattern matching logic in isolation
  function matchCommand(command, patterns) {
    if (command.includes(patterns.git_commit)) return 'commit_success';
    if (command.includes(patterns.git_push)) return 'push_success';
    for (const tc of patterns.test_commands) {
      if (command.includes(tc)) return 'test';
    }
    for (const bc of patterns.build_commands) {
      if (command.includes(bc)) return 'build';
    }
    for (const lc of patterns.lint_commands) {
      if (command.includes(lc)) return 'lint';
    }
    return null;
  }

  const patterns = {
    git_commit: 'git commit',
    git_push: 'git push',
    test_commands: ['npm test', 'npx jest', 'pytest', 'cargo test', 'go test'],
    build_commands: ['npm run build', 'npx next build', 'cargo build', 'go build', 'make'],
    lint_commands: ['npm run lint', 'eslint', 'pylint', 'cargo clippy'],
  };

  it('matches git commit', () => {
    assert.strictEqual(matchCommand('git commit -m "fix"', patterns), 'commit_success');
  });

  it('matches git push', () => {
    assert.strictEqual(matchCommand('git push origin main', patterns), 'push_success');
  });

  it('matches npm test', () => {
    assert.strictEqual(matchCommand('npm test', patterns), 'test');
  });

  it('matches npm run build', () => {
    assert.strictEqual(matchCommand('npm run build', patterns), 'build');
  });

  it('matches eslint', () => {
    assert.strictEqual(matchCommand('eslint src/', patterns), 'lint');
  });

  it('returns null for unrecognized commands', () => {
    assert.strictEqual(matchCommand('ls -la', patterns), null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails (it should actually pass since it's pure logic)**

```bash
node --test tests/handlers.test.js
```
Expected: PASS (these are pure logic tests with no module dependency).

- [ ] **Step 3: Create hooks.json**

```json
// hooks/hooks.json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$PLUGIN_DIR/scripts/handlers/on-session-start.js\""
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
            "command": "node \"$PLUGIN_DIR/scripts/handlers/on-bash-complete.js\""
          }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$PLUGIN_DIR/scripts/handlers/on-file-write.js\""
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$PLUGIN_DIR/scripts/handlers/on-stop.js\""
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$PLUGIN_DIR/scripts/handlers/on-task-done.js\""
          }
        ]
      }
    ],
    "TeammateIdle": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$PLUGIN_DIR/scripts/handlers/on-teammate-idle.js\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 4: Create shared handler bootstrap**

Each handler needs to init config, bgm, tts, notifier. Create a small helper at `scripts/handlers/_bootstrap.js`:

```javascript
// scripts/handlers/_bootstrap.js
const Config = require('../core/config.js');
const BGMManager = require('../core/bgm.js');
const TTSEngine = require('../core/tts.js');
const Notifier = require('../core/notify.js');

function bootstrap() {
  const config = new Config();
  config.load();
  const bgm = new BGMManager(config);
  const tts = new TTSEngine(config);
  const notifier = new Notifier(config, bgm, tts);
  return { config, bgm, tts, notifier };
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    // If no stdin after 1s, resolve empty
    setTimeout(() => resolve({}), 1000);
  });
}

module.exports = { bootstrap, readStdin };
```

- [ ] **Step 5: Create on-session-start.js**

```javascript
// scripts/handlers/on-session-start.js
const { bootstrap } = require('./_bootstrap.js');

(async () => {
  const { config, bgm, notifier } = bootstrap();

  // Auto-start BGM if configured
  if (config.get('bgm.auto_start')) {
    try {
      await bgm.start();
    } catch (err) {
      console.error('[CFM] BGM auto-start failed:', err.message);
    }
  }

  // Play session start notification
  await notifier.notify('session_start');
})();
```

- [ ] **Step 6: Create on-bash-complete.js**

```javascript
// scripts/handlers/on-bash-complete.js
const { bootstrap, readStdin } = require('./_bootstrap.js');

(async () => {
  const input = await readStdin();
  const command = input?.tool_input?.command || '';
  const stdout = input?.tool_response?.stdout || '';
  const stderr = input?.tool_response?.stderr || '';

  if (!command) return;

  const { config, notifier } = bootstrap();
  const patterns = config.get('advanced.patterns');
  if (!patterns) return;

  // Git commit
  if (command.includes(patterns.git_commit) && !stderr) {
    await notifier.notify('commit_success');
    return;
  }

  // Git push
  if (command.includes(patterns.git_push) && !stderr) {
    await notifier.notify('push_success');
    return;
  }

  // Test commands
  for (const tc of patterns.test_commands || []) {
    if (command.includes(tc)) {
      const failIndicators = ['FAIL', 'FAILED', 'failure', 'Error', 'error'];
      const hasFail = failIndicators.some((f) => stderr.includes(f) || stdout.includes(f));
      if (hasFail) {
        // Try to parse failure count
        const countMatch = (stderr + stdout).match(/(\d+)\s+fail/i);
        const count = countMatch ? parseInt(countMatch[1], 10) : 1;
        await notifier.notify('test_fail', { count });
      } else {
        await notifier.notify('build_success'); // tests passed
      }
      return;
    }
  }

  // Build commands
  for (const bc of patterns.build_commands || []) {
    if (command.includes(bc)) {
      if (stderr && (stderr.includes('error') || stderr.includes('Error'))) {
        await notifier.notify('build_fail');
      } else {
        await notifier.notify('build_success');
      }
      return;
    }
  }

  // Lint commands
  for (const lc of patterns.lint_commands || []) {
    if (command.includes(lc) && stderr) {
      await notifier.notify('lint_error');
      return;
    }
  }
})();
```

- [ ] **Step 7: Create remaining handlers (on-file-write, on-task-done, on-stop, on-teammate-idle)**

```javascript
// scripts/handlers/on-file-write.js
// No-op for now. Future: track file write frequency.
```

```javascript
// scripts/handlers/on-task-done.js
const { bootstrap } = require('./_bootstrap.js');

(async () => {
  const { notifier } = bootstrap();
  await notifier.notify('task_completed');
})();
```

```javascript
// scripts/handlers/on-stop.js
const { bootstrap } = require('./_bootstrap.js');
const fs = require('node:fs');

(async () => {
  const { config, bgm, notifier } = bootstrap();

  // Goodbye notification
  await notifier.notify('session_end');

  // Stop BGM
  await bgm.stop();

  // Cleanup pomodoro PID
  const pidPath = config.getPidPath();
  try {
    if (fs.existsSync(pidPath)) {
      const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
      try { process.kill(pid); } catch { /* already dead */ }
      fs.unlinkSync(pidPath);
    }
  } catch { /* ignore */ }

  // Cleanup status file
  const statusPath = config.getStatusPath();
  try { fs.unlinkSync(statusPath); } catch { /* ignore */ }
})();
```

```javascript
// scripts/handlers/on-teammate-idle.js
const { bootstrap } = require('./_bootstrap.js');

(async () => {
  const { notifier } = bootstrap();
  await notifier.notify('subagent_done');
})();
```

- [ ] **Step 8: Commit**

```bash
git add hooks/ scripts/handlers/ tests/handlers.test.js
git commit -m "feat: add hook handlers for session lifecycle, bash events, task completion"
```

---

### Task 8: Generate Sound Effect Files

**Files:**
- Create: `sounds/chime-soft.wav`
- Create: `sounds/success.wav`
- Create: `sounds/success-big.wav`
- Create: `sounds/warn-soft.wav`
- Create: `sounds/error.wav`
- Create: `sounds/knock.wav`
- Create: `sounds/bell.wav`
- Create: `sounds/bell-soft.wav`
- Create: `sounds/tick.wav`

- [ ] **Step 1: Generate all sound effects with ffmpeg**

```bash
mkdir -p sounds

# chime-soft.wav — gentle 440Hz chime, 0.3s
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=0.3" -af "afade=t=out:st=0.1:d=0.2" sounds/chime-soft.wav

# success.wav — two ascending tones (C5→E5)
ffmpeg -y -f lavfi -i "sine=frequency=523:duration=0.15" -f lavfi -i "sine=frequency=659:duration=0.15" -filter_complex "[0][1]concat=n=2:v=0:a=1,afade=t=out:st=0.2:d=0.1" sounds/success.wav

# success-big.wav — three ascending tones (C5→E5→G5), celebratory
ffmpeg -y -f lavfi -i "sine=frequency=523:duration=0.15" -f lavfi -i "sine=frequency=659:duration=0.15" -f lavfi -i "sine=frequency=784:duration=0.25" -filter_complex "[0][1][2]concat=n=3:v=0:a=1,afade=t=out:st=0.35:d=0.2" sounds/success-big.wav

# warn-soft.wav — lower pitch warning (E4), 0.4s
ffmpeg -y -f lavfi -i "sine=frequency=330:duration=0.4" -af "afade=t=out:st=0.2:d=0.2" sounds/warn-soft.wav

# error.wav — two descending tones (E4→C4)
ffmpeg -y -f lavfi -i "sine=frequency=330:duration=0.2" -f lavfi -i "sine=frequency=262:duration=0.3" -filter_complex "[0][1]concat=n=2:v=0:a=1,afade=t=out:st=0.3:d=0.2" sounds/error.wav

# knock.wav — short percussive knock (noise burst)
ffmpeg -y -f lavfi -i "sine=frequency=200:duration=0.08" -af "afade=t=out:st=0.02:d=0.06" sounds/knock.wav

# bell.wav — clear bell tone (A5), 0.5s with decay
ffmpeg -y -f lavfi -i "sine=frequency=880:duration=0.5" -af "afade=t=out:st=0.1:d=0.4" sounds/bell.wav

# bell-soft.wav — softer bell (A4), 0.4s
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=0.4" -af "afade=t=out:st=0.1:d=0.3,volume=0.6" sounds/bell-soft.wav

# tick.wav — short tick (1kHz), 0.05s
ffmpeg -y -f lavfi -i "sine=frequency=1000:duration=0.05" -af "afade=t=out:st=0.01:d=0.04" sounds/tick.wav
```

- [ ] **Step 2: Verify all sound files exist**

```bash
ls -la sounds/
```
Expected: 9 .wav files.

- [ ] **Step 3: Commit**

```bash
git add sounds/
git commit -m "feat: generate sound effect files using ffmpeg"
```

---

## Phase 3: Pomodoro & Focus

### Task 9: Pomodoro Timer (`scripts/core/pomodoro.js`)

**Files:**
- Create: `scripts/core/pomodoro.js`
- Create: `tests/pomodoro.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/pomodoro.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');

function createMockConfig() {
  return {
    get: (p) => {
      const data = {
        'pomodoro.enabled': true,
        'pomodoro.work_minutes': 25,
        'pomodoro.short_break_minutes': 5,
        'pomodoro.long_break_minutes': 15,
        'pomodoro.sessions_before_long_break': 4,
        'pomodoro.auto_start_break': true,
        'pomodoro.auto_start_work': false,
        'pomodoro.music_override.work': null,
        'pomodoro.music_override.short_break': 'nature',
        'pomodoro.music_override.long_break': 'nature',
      };
      return data[p];
    },
    getPidPath: () => '/tmp/cfm-test-pomodoro.pid',
    getStatusPath: () => '/tmp/cfm-test-pomodoro-status.json',
  };
}

function createMockNotifier() {
  const calls = [];
  return {
    calls,
    notify: async (event, vars) => calls.push({ event, vars }),
  };
}

function createMockBGM() {
  const calls = [];
  return {
    calls,
    switchMode: async (mode) => calls.push({ method: 'switchMode', mode }),
  };
}

describe('PomodoroTimer', () => {
  it('initializes in stopped state', () => {
    const PomodoroTimer = require('../scripts/core/pomodoro.js');
    const timer = new PomodoroTimer(createMockConfig(), createMockNotifier(), createMockBGM());

    const status = timer.status();
    assert.strictEqual(status.phase, 'stopped');
    assert.strictEqual(status.session_number, 0);
    assert.strictEqual(status.is_paused, false);
  });

  it('starts in work phase', () => {
    const PomodoroTimer = require('../scripts/core/pomodoro.js');
    const timer = new PomodoroTimer(createMockConfig(), createMockNotifier(), createMockBGM());

    timer.start();
    const status = timer.status();
    assert.strictEqual(status.phase, 'work');
    assert.strictEqual(status.session_number, 1);
    assert.ok(status.remaining_seconds > 0);

    timer.stop(); // cleanup
  });

  it('stops the timer', () => {
    const PomodoroTimer = require('../scripts/core/pomodoro.js');
    const timer = new PomodoroTimer(createMockConfig(), createMockNotifier(), createMockBGM());

    timer.start();
    timer.stop();
    const status = timer.status();
    assert.strictEqual(status.phase, 'stopped');
  });

  it('pauses and resumes', () => {
    const PomodoroTimer = require('../scripts/core/pomodoro.js');
    const timer = new PomodoroTimer(createMockConfig(), createMockNotifier(), createMockBGM());

    timer.start();
    timer.pause();
    assert.strictEqual(timer.status().is_paused, true);

    timer.resume();
    assert.strictEqual(timer.status().is_paused, false);

    timer.stop();
  });

  it('calculates break type correctly', () => {
    const PomodoroTimer = require('../scripts/core/pomodoro.js');
    const timer = new PomodoroTimer(createMockConfig(), createMockNotifier(), createMockBGM());

    // Sessions 1-3 → short break, session 4 → long break
    assert.strictEqual(timer._getBreakType(1), 'short_break');
    assert.strictEqual(timer._getBreakType(3), 'short_break');
    assert.strictEqual(timer._getBreakType(4), 'long_break');
    assert.strictEqual(timer._getBreakType(8), 'long_break');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test tests/pomodoro.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement pomodoro.js**

```javascript
// scripts/core/pomodoro.js
const fs = require('node:fs');

class PomodoroTimer {
  constructor(config, notifier, bgmManager) {
    this._config = config;
    this._notifier = notifier;
    this._bgm = bgmManager;
    this._phase = 'stopped';        // 'work' | 'short_break' | 'long_break' | 'stopped'
    this._sessionNumber = 0;
    this._totalSessionsToday = 0;
    this._isPaused = false;
    this._timer = null;
    this._warningTimer = null;
    this._endTime = null;
    this._pausedRemaining = null;
    this._previousBgmMode = null;
  }

  start() {
    if (this._phase !== 'stopped') this.stop();
    this._sessionNumber++;
    this._totalSessionsToday++;
    this._phase = 'work';
    this._isPaused = false;
    const minutes = this._config.get('pomodoro.work_minutes') || 25;
    this._startPhase(minutes * 60, () => this._onWorkEnd());

    // Set warning at 5 minutes before end (if work > 5 min)
    if (minutes > 5) {
      const warningMs = (minutes - 5) * 60 * 1000;
      this._warningTimer = setTimeout(() => this._onWarning(), warningMs);
    }

    this._saveStatus();
  }

  stop() {
    this._clearTimers();
    this._phase = 'stopped';
    this._isPaused = false;
    this._endTime = null;
    this._pausedRemaining = null;
    this._removePID();
    this._saveStatus();
  }

  skip() {
    if (this._phase === 'work') {
      this._onWorkEnd();
    } else if (this._phase === 'short_break' || this._phase === 'long_break') {
      this._onBreakEnd();
    }
  }

  pause() {
    if (this._phase === 'stopped' || this._isPaused) return;
    this._isPaused = true;
    this._pausedRemaining = Math.max(0, this._endTime - Date.now());
    this._clearTimers();
    this._saveStatus();
  }

  resume() {
    if (!this._isPaused) return;
    this._isPaused = false;
    const remaining = this._pausedRemaining || 0;
    this._pausedRemaining = null;

    const callback = this._phase === 'work'
      ? () => this._onWorkEnd()
      : () => this._onBreakEnd();
    this._endTime = Date.now() + remaining;
    this._timer = setTimeout(callback, remaining);
    this._saveStatus();
  }

  status() {
    let remaining_seconds = 0;
    if (this._isPaused && this._pausedRemaining) {
      remaining_seconds = Math.round(this._pausedRemaining / 1000);
    } else if (this._endTime) {
      remaining_seconds = Math.max(0, Math.round((this._endTime - Date.now()) / 1000));
    }

    return {
      phase: this._phase,
      remaining_seconds,
      session_number: this._sessionNumber,
      total_sessions_today: this._totalSessionsToday,
      is_paused: this._isPaused,
    };
  }

  _getBreakType(sessionNumber) {
    const longBreakEvery = this._config.get('pomodoro.sessions_before_long_break') || 4;
    return (sessionNumber % longBreakEvery === 0) ? 'long_break' : 'short_break';
  }

  async _onWorkEnd() {
    this._clearTimers();
    await this._notifier.notify('pomodoro_end');

    const breakType = this._getBreakType(this._sessionNumber);
    const autoStartBreak = this._config.get('pomodoro.auto_start_break');

    if (autoStartBreak) {
      this._phase = breakType;
      const breakKey = breakType === 'long_break' ? 'long_break_minutes' : 'short_break_minutes';
      const minutes = this._config.get(`pomodoro.${breakKey}`) || 5;

      // Switch BGM for break if configured
      const overrideMode = this._config.get(`pomodoro.music_override.${breakType}`);
      if (overrideMode) {
        try {
          await this._bgm.switchMode(overrideMode);
        } catch { /* ignore */ }
      }

      this._startPhase(minutes * 60, () => this._onBreakEnd());
      this._saveStatus();
    } else {
      this._phase = 'stopped';
      this._saveStatus();
    }
  }

  async _onBreakEnd() {
    this._clearTimers();
    await this._notifier.notify('break_end');

    // Restore work BGM if it was overridden
    const workOverride = this._config.get('pomodoro.music_override.work');
    if (workOverride) {
      try {
        await this._bgm.switchMode(workOverride);
      } catch { /* ignore */ }
    }

    const autoStartWork = this._config.get('pomodoro.auto_start_work');
    if (autoStartWork) {
      this.start();
    } else {
      this._phase = 'stopped';
      this._saveStatus();
    }
  }

  async _onWarning() {
    await this._notifier.notify('pomodoro_warning');
  }

  _startPhase(seconds, callback) {
    this._endTime = Date.now() + seconds * 1000;
    this._timer = setTimeout(callback, seconds * 1000);
  }

  _clearTimers() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this._warningTimer) { clearTimeout(this._warningTimer); this._warningTimer = null; }
  }

  _saveStatus() {
    try {
      const statusPath = this._config.getStatusPath();
      fs.writeFileSync(statusPath, JSON.stringify(this.status(), null, 2));
    } catch { /* ignore */ }
  }

  _savePID() {
    try {
      fs.writeFileSync(this._config.getPidPath(), String(process.pid));
    } catch { /* ignore */ }
  }

  _removePID() {
    try { fs.unlinkSync(this._config.getPidPath()); } catch { /* ignore */ }
  }
}

module.exports = PomodoroTimer;

// If run as standalone daemon
if (require.main === module) {
  const Config = require('./config.js');
  const BGMManager = require('./bgm.js');
  const TTSEngine = require('./tts.js');
  const Notifier = require('./notify.js');

  const config = new Config();
  config.load();
  const bgm = new BGMManager(config);
  const tts = new TTSEngine(config);
  const notifier = new Notifier(config, bgm, tts);
  const timer = new PomodoroTimer(config, notifier, bgm);

  const action = process.argv[2];
  if (action === 'start') {
    timer._savePID();
    timer.start();
    // Keep process alive
    setInterval(() => timer._saveStatus(), 5000);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test tests/pomodoro.test.js
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/core/pomodoro.js tests/pomodoro.test.js
git commit -m "feat: add pomodoro timer with work/break cycles, pause/resume, status tracking"
```

---

### Task 10: `/timer` Slash Command

**Files:**
- Create: `commands/timer.md`

- [ ] **Step 1: Write the command definition**

```markdown
<!-- commands/timer.md -->
# /timer Command

Manage pomodoro work/break timer.

## Usage
- `/timer start`          — Start a 25-min work session
- `/timer stop`           — Stop the timer
- `/timer skip`           — Skip to next phase (work→break or break→work)
- `/timer pause`          — Pause the timer
- `/timer resume`         — Resume the timer
- `/timer status`         — Show current timer state
- `/timer config <k> <v>` — Adjust settings (e.g., work_minutes 50)

## Implementation

1. Parse the subcommand from user input.

2. For `start`: Spawn the pomodoro daemon if not running:
   ```bash
   node "$PLUGIN_DIR/scripts/core/pomodoro.js" start &
   ```
   Respond: "Pomodoro started. 25 minutes of focused work."

3. For `stop`: Read PID from temp file and kill the process.
   Respond: "Timer stopped."

4. For `skip`: Signal the daemon to skip the current phase.
   Respond: "Skipped to next phase."

5. For `pause`/`resume`: Signal the daemon.
   Respond: "Timer paused." / "Timer resumed."

6. For `status`: Read `/tmp/cfm-pomodoro-status.json` and display:
   - Current phase (work/break/stopped)
   - Time remaining
   - Session number
   - Total sessions today

7. For `config`: Update the runtime config value.
   Respond: "Updated {key} to {value}."
```

- [ ] **Step 2: Commit**

```bash
git add commands/timer.md
git commit -m "feat: add /timer slash command definition"
```

---

### Task 11: `/focus` Slash Command

**Files:**
- Create: `commands/focus.md`

- [ ] **Step 1: Write the command definition**

```markdown
<!-- commands/focus.md -->
# /focus Command

Switch between focus mode presets or turn off all features.

## Usage
- `/focus deep`  — Deep work: lo-fi music, SFX only (no TTS), pomodoro auto-starts
- `/focus write` — Writing: jazz + rain, gentle TTS enabled
- `/focus chill` — Relaxed: nature sounds, all notifications
- `/focus off`   — Stop BGM, disable notifications

## Implementation

1. Parse the mode argument.

2. Load the focus mode preset from config (`focus_modes.{mode}`).

3. Apply all settings from the preset:
   a. Switch BGM mode: `bgm.switchMode(preset.bgm_mode)`
   b. Set BGM volume: `bgm.setVolume(preset.bgm_volume)`
   c. Toggle TTS: update runtime notification settings
   d. If `pomodoro_auto_start` is true, start pomodoro timer

4. For `off`:
   a. Stop BGM
   b. Stop pomodoro timer
   c. Disable notifications for this session

5. Confirm mode switch with a notification (respecting the new mode's settings).

6. Respond with a summary of what changed.
```

- [ ] **Step 2: Commit**

```bash
git add commands/focus.md
git commit -m "feat: add /focus slash command definition"
```

---

## Phase 4: AI Companion

### Task 12: Research Mate Subagent

**Files:**
- Create: `agents/research-mate.md`
- Create: `commands/mate.md`

- [ ] **Step 1: Write the subagent definition**

```markdown
<!-- agents/research-mate.md -->
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

- [ ] **Step 2: Write the `/mate` command definition**

```markdown
<!-- commands/mate.md -->
# /mate Command

Dispatch background research tasks to a subagent.

## Usage
- `/mate research <topic>` — Start background research on a topic

## Implementation

1. Parse the subcommand. Currently only `research` is supported.

2. Extract the topic from the remaining arguments.

3. Launch the `research-mate` subagent with the topic as context:
   - The subagent runs in a separate context
   - It performs web search and summarization
   - Results are saved to /tmp/cfm-research-output.md

4. When the subagent completes, the TeammateIdle hook fires,
   which plays the `subagent_done` notification.

5. The user can then ask about the research results. The main
   Claude session can read /tmp/cfm-research-output.md.

6. If no topic provided, show usage help.
```

- [ ] **Step 3: Commit**

```bash
git add agents/research-mate.md commands/mate.md
git commit -m "feat: add research-mate subagent and /mate command"
```

---

### Task 12b: Focus Tips Skill (`skills/focus-tips.md`)

**Files:**
- Create: `skills/focus-tips.md`

- [ ] **Step 1: Write the skill definition**

```markdown
<!-- skills/focus-tips.md -->
# Focus Tips

Contextual productivity tips based on the user's current focus mode and session state.

## When to use
Offer tips when:
- User has been in a work session for over 20 minutes without a break
- User switches focus modes
- User explicitly asks for productivity advice

## Tips by Mode

### Deep Work
- Block all non-essential notifications
- Close unrelated browser tabs
- Use single-tasking: one feature at a time
- If stuck for >10 minutes, take a 2-minute walk

### Writing Mode
- Start with an outline before prose
- Write first, edit later — don't self-censor
- Use the pomodoro to timebox writing sprints

### Chill Mode
- Good for exploratory coding and prototyping
- Review and refactor existing code
- Catch up on code reviews and documentation

## General Tips
- Hydrate regularly — keep water nearby
- Every 25 minutes, look at something 20 feet away for 20 seconds (20-20-20 rule)
- If context-switching, write a quick note about where you left off
```

- [ ] **Step 2: Commit**

```bash
git add skills/focus-tips.md
git commit -m "feat: add focus-tips contextual productivity skill"
```

---

## Phase 5: Polish

### Task 13: Setup Script (`scripts/cli/setup.js`)

**Files:**
- Create: `scripts/cli/setup.js`

- [ ] **Step 1: Implement setup.js**

```javascript
// scripts/cli/setup.js
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REQUIRED = ['mpv', 'yt-dlp', 'socat'];
const TTS_ENGINES = {
  'edge-tts': 'edge-tts --help',
  'espeak-ng': 'espeak-ng --version',
};

function checkCommand(cmd) {
  try {
    execSync(`${cmd} 2>&1`, { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    // Some commands exit non-zero for --help but still exist
    try {
      const which = process.platform === 'win32' ? 'where' : 'which';
      execSync(`${which} ${cmd.split(' ')[0]}`, { stdio: 'pipe', timeout: 3000 });
      return true;
    } catch {
      return false;
    }
  }
}

function main() {
  console.log('=== Chill Focus Mate Setup ===\n');

  // 1. Check required dependencies
  console.log('Checking required dependencies...');
  let allOk = true;
  for (const dep of REQUIRED) {
    const ok = checkCommand(dep);
    console.log(`  ${ok ? '[OK]' : '[MISSING]'} ${dep}`);
    if (!ok) allOk = false;
  }

  if (!allOk) {
    console.log('\nInstall missing dependencies:');
    if (process.platform === 'darwin') {
      console.log('  brew install mpv yt-dlp');
    } else if (process.platform === 'linux') {
      console.log('  sudo apt install mpv && pip install yt-dlp');
    } else {
      console.log('  Install mpv from https://mpv.io/installation/');
      console.log('  Install yt-dlp: pip install yt-dlp');
    }
  }

  // 2. Check TTS engines
  console.log('\nChecking TTS engines...');
  let hasTTS = false;
  for (const [name, cmd] of Object.entries(TTS_ENGINES)) {
    const ok = checkCommand(cmd);
    console.log(`  ${ok ? '[OK]' : '[--]'} ${name}`);
    if (ok) hasTTS = true;
  }

  // System TTS
  if (process.platform === 'darwin') {
    console.log('  [OK] system (macOS say)');
    hasTTS = true;
  } else if (process.platform === 'linux' && checkCommand('spd-say --version')) {
    console.log('  [OK] system (spd-say)');
    hasTTS = true;
  }

  if (!hasTTS) {
    console.log('\n  No TTS engine found. Install one:');
    console.log('    pip install edge-tts  (recommended, free, natural voices)');
  }

  // 3. Create config directory
  const configDir = path.join(os.homedir(), '.claude', '.chill-focus-mate');
  fs.mkdirSync(configDir, { recursive: true });
  console.log(`\nConfig directory: ${configDir}`);

  // 4. Copy default config if needed
  const userConfig = path.join(configDir, 'config.yaml');
  if (!fs.existsSync(userConfig)) {
    const defaultConfig = path.join(__dirname, '..', '..', 'config', 'default.yaml');
    if (fs.existsSync(defaultConfig)) {
      fs.copyFileSync(defaultConfig, userConfig);
      console.log('  Copied default config to user config');
    }
  } else {
    console.log('  User config already exists');
  }

  // 5. Create TTS cache directory
  const cacheDir = path.join(configDir, 'tts-cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  console.log(`  TTS cache: ${cacheDir}`);

  console.log('\n=== Setup Complete ===');
  if (allOk && hasTTS) {
    console.log('All dependencies found. Ready to use!');
  } else {
    console.log('Some dependencies are missing. Install them for full functionality.');
  }
}

main();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/cli/setup.js
git commit -m "feat: add setup script for dependency checking and config initialization"
```

---

### Task 14: Reset Script (`scripts/cli/reset.js`)

**Files:**
- Create: `scripts/cli/reset.js`

- [ ] **Step 1: Implement reset.js**

```javascript
// scripts/cli/reset.js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function main() {
  console.log('=== Chill Focus Mate Reset ===\n');

  const tmpDir = process.platform === 'win32' ? os.tmpdir() : '/tmp';

  // Kill pomodoro daemon
  const pidPath = path.join(tmpDir, 'cfm-pomodoro.pid');
  try {
    if (fs.existsSync(pidPath)) {
      const pid = parseInt(fs.readFileSync(pidPath, 'utf8').trim(), 10);
      console.log(`Killing pomodoro daemon (PID: ${pid})...`);
      try { process.kill(pid); } catch { /* already dead */ }
      fs.unlinkSync(pidPath);
      console.log('  Done.');
    } else {
      console.log('No pomodoro daemon running.');
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  // Remove status file
  const statusPath = path.join(tmpDir, 'cfm-pomodoro-status.json');
  try { fs.unlinkSync(statusPath); } catch { /* ignore */ }

  // Remove mpv socket (Unix only)
  if (process.platform !== 'win32') {
    const socketPath = '/tmp/cfm-bgm-socket';
    try { fs.unlinkSync(socketPath); } catch { /* ignore */ }
    console.log('Removed mpv socket.');
  }

  // Kill any remaining mpv processes started by us
  // (best-effort, platform-specific)
  try {
    if (process.platform === 'win32') {
      require('node:child_process').execSync('taskkill /f /im mpv.exe 2>nul', { stdio: 'pipe' });
    } else {
      require('node:child_process').execSync("pkill -f 'mpv.*cfm-bgm-socket' 2>/dev/null || true", { stdio: 'pipe' });
    }
    console.log('Killed mpv processes.');
  } catch {
    console.log('No mpv processes to kill.');
  }

  // Remove research output
  const researchPath = path.join(tmpDir, 'cfm-research-output.md');
  try { fs.unlinkSync(researchPath); } catch { /* ignore */ }

  console.log('\n=== Reset Complete ===');
}

main();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/cli/reset.js
git commit -m "feat: add reset script to kill managed processes and cleanup temp files"
```

---

### Task 15: Run All Tests

- [ ] **Step 1: Run the full test suite**

```bash
node --test tests/
```
Expected: All tests PASS.

- [ ] **Step 2: Fix any failures, then commit**

If there are failures, fix them and commit each fix individually.

---

### Task 16: Final Verification

- [ ] **Step 1: Verify project structure matches DESIGN.md**

```bash
find . -type f -not -path './.git/*' -not -path './node_modules/*' | sort
```

Expected structure should match the file structure in DESIGN.md Section 3.

- [ ] **Step 2: Run setup script to verify**

```bash
node scripts/cli/setup.js
```

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git status
# If there are changes:
git commit -m "chore: final cleanup and project structure verification"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| Phase 1 | Tasks 1-4 | Scaffolding, config loader, BGM manager, /music command |
| Phase 2 | Tasks 5-8 | TTS engine, notifier, all hook handlers, sound effects |
| Phase 3 | Tasks 9-11 | Pomodoro timer, /timer command, /focus command |
| Phase 4 | Tasks 12-12b | Research-mate subagent, /mate command, focus-tips skill |
| Phase 5 | Tasks 13-16 | Setup script, reset script, full test run, verification |
