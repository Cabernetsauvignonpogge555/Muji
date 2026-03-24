#!/usr/bin/env node
/**
 * ElevenLabs voice file generator for Muji.
 *
 * Usage:
 *   # Generate all default voices (skips existing files)
 *   ELEVENLABS_API_KEY=sk_xxx node scripts/tools/generate-voices.js
 *
 *   # Generate from custom YAML file
 *   ELEVENLABS_API_KEY=sk_xxx node scripts/tools/generate-voices.js --config custom-voices.yaml
 *
 *   # Force regenerate (overwrite existing files)
 *   ELEVENLABS_API_KEY=sk_xxx node scripts/tools/generate-voices.js --force
 *
 *   # Use a specific voice ID
 *   ELEVENLABS_API_KEY=sk_xxx node scripts/tools/generate-voices.js --voice-id AbCdEfGhIjKlMnOpQrSt
 *
 *   # Generate only specific events
 *   ELEVENLABS_API_KEY=sk_xxx node scripts/tools/generate-voices.js --only session_start,idle_01
 *
 *   # Generate only specific languages
 *   ELEVENLABS_API_KEY=sk_xxx node scripts/tools/generate-voices.js --lang ko
 *
 * Custom YAML format (see config/custom-voices.example.yaml):
 *   voice_id: "YOUR_VOICE_ID"
 *   model_id: "eleven_multilingual_v2"
 *   voice_settings:
 *     stability: 0.5
 *     similarity_boost: 0.75
 *   messages:
 *     my_custom_event:
 *       en: "Hello world"
 *       ko: "안녕하세요"
 */

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}
const hasFlag = (flag) => args.includes(flag);

const API_KEY = process.env.ELEVENLABS_API_KEY || '';
const FORCE = hasFlag('--force');
const CONFIG_PATH = getArg('--config');
const VOICE_ID_OVERRIDE = getArg('--voice-id');
const ONLY_EVENTS = getArg('--only')?.split(',').map((s) => s.trim());
const ONLY_LANGS = getArg('--lang')?.split(',').map((s) => s.trim());
const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'sounds', 'voices');

// ---------------------------------------------------------------------------
// Default messages (built-in)
// ---------------------------------------------------------------------------
const DEFAULT_MESSAGES = {
  session_start: {
    en: "Let's get started.",
    ko: '같이 시작해볼까?',
    ja: '始めよう。',
  },
  push_success: {
    en: 'Push complete.',
    ko: '푸시 완료!',
  },
  build_success: {
    en: 'Build complete, no errors.',
    ko: '빌드 끝났어, 에러 없어.',
  },
  build_fail: {
    en: 'Build failed. Check the output.',
    ko: '빌드 실패했어. 확인해봐.',
  },
  subagent_done: {
    en: 'Research is ready.',
    ko: '리서치 정리해뒀어.',
  },
  pomodoro_end: {
    en: '25 minutes up. Take a break.',
    ko: '25분 지났어, 쉬어가자.',
  },
  pomodoro_warning: {
    en: '5 minutes left.',
    ko: '5분 남았어.',
  },
  break_end: {
    en: 'Break is over. Ready to continue?',
    ko: '다시 시작할까?',
  },
  task_completed: {
    en: 'Task done.',
    ko: '작업 끝났어.',
  },
  session_end: {
    en: 'Great session. Take care.',
    ko: '오늘 수고했어. 푹 쉬어.',
  },
  error_generic: {
    en: 'An error occurred.',
    ko: '에러 발생했어.',
  },
  hourly_01: {
    en: 'It has been an hour. How is it going?',
    ko: '벌써 한 시간 지났어. 잘 되고 있어?',
  },
  hourly_02: {
    en: "Another hour down. Don't forget to hydrate.",
    ko: '한 시간 지났다. 물 마시는 거 잊지 마.',
  },
  hourly_03: {
    en: "One more hour. You're making good progress.",
    ko: '한 시간 또 지났네. 잘 하고 있어.',
  },
  idle_01: {
    en: 'It has been a while. Maybe go for a short walk?',
    ko: '좀 쉬어가는 게 어때? 잠깐 산책하고 와.',
  },
  idle_02: {
    en: 'You have been quiet. Stretch a bit, I will be here.',
    ko: '좀 조용하네. 스트레칭이라도 하고 와, 기다릴게.',
  },
  idle_03: {
    en: 'Still there? Take a breather if you need one.',
    ko: '아직 있어? 필요하면 잠깐 쉬어도 돼.',
  },
  idle_04: {
    en: 'No rush. Grab some water and come back fresh.',
    ko: '서두를 거 없어. 물 한 잔 하고 와.',
  },
  idle_05: {
    en: 'Hey, do not forget to rest your eyes for a moment.',
    ko: '야, 눈 좀 쉬어줘. 잠깐이라도.',
  },
};

// ---------------------------------------------------------------------------
// Load custom config
// ---------------------------------------------------------------------------
function loadCustomConfig(configPath) {
  let YAML;
  try {
    YAML = require('yaml');
  } catch {
    console.error('Error: yaml package required for custom config. Run: npm install yaml');
    process.exit(1);
  }
  const content = fs.readFileSync(configPath, 'utf8');
  return YAML.parse(content);
}

// ---------------------------------------------------------------------------
// ElevenLabs API
// ---------------------------------------------------------------------------
function synthesize(text, outputPath, voiceId, modelId, voiceSettings) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      text,
      model_id: modelId || 'eleven_multilingual_v2',
      voice_settings: voiceSettings || {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errData = '';
        res.on('data', (c) => (errData += c));
        res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${errData}`)));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        fs.writeFileSync(outputPath, Buffer.concat(chunks));
        resolve(outputPath);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!API_KEY) {
    console.error('Error: ELEVENLABS_API_KEY environment variable is required.');
    console.error('  Set it: ELEVENLABS_API_KEY=sk_xxx node scripts/tools/generate-voices.js');
    process.exit(1);
  }

  let voiceId = VOICE_ID_OVERRIDE || 'NYYvfgcWTZs3NndsUIuq';
  let modelId = 'eleven_multilingual_v2';
  let voiceSettings = null;
  let messages = DEFAULT_MESSAGES;

  // Load custom config if provided
  if (CONFIG_PATH) {
    const custom = loadCustomConfig(CONFIG_PATH);
    if (custom.voice_id) voiceId = custom.voice_id;
    if (custom.model_id) modelId = custom.model_id;
    if (custom.voice_settings) voiceSettings = custom.voice_settings;
    if (custom.messages) {
      // Merge: custom messages override defaults
      messages = { ...DEFAULT_MESSAGES, ...custom.messages };
    }
    console.log(`Loaded custom config: ${CONFIG_PATH}`);
  }

  console.log(`Voice ID: ${voiceId}`);
  console.log(`Model: ${modelId}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Force: ${FORCE}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Build entry list
  const entries = [];
  for (const [event, langs] of Object.entries(messages)) {
    if (ONLY_EVENTS && !ONLY_EVENTS.includes(event)) continue;
    for (const [lang, text] of Object.entries(langs)) {
      if (ONLY_LANGS && !ONLY_LANGS.includes(lang)) continue;
      entries.push({ event, lang, text });
    }
  }

  console.log(`Generating ${entries.length} voice files...\n`);

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const { event, lang, text } of entries) {
    const langDir = path.join(OUTPUT_DIR, lang);
    fs.mkdirSync(langDir, { recursive: true });
    const outPath = path.join(langDir, `${event}.mp3`);

    if (!FORCE && fs.existsSync(outPath)) {
      console.log(`  SKIP  ${lang}/${event}.mp3 (already exists)`);
      skipped++;
      continue;
    }

    process.stdout.write(`  GEN   ${lang}/${event}.mp3 ... `);
    try {
      await synthesize(text, outPath, voiceId, modelId, voiceSettings);
      console.log('OK');
      generated++;
    } catch (err) {
      console.log(`FAIL: ${err.message}`);
      failed++;
    }
    // Rate limit: ~2 requests/sec to be safe
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`\nDone! Generated: ${generated}, Skipped: ${skipped}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
