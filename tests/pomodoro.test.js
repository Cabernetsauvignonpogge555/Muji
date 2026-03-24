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
  return { calls, notify: async (event, vars) => calls.push({ event, vars }) };
}

function createMockBGM() {
  const calls = [];
  return { calls, switchMode: async (mode) => calls.push({ method: 'switchMode', mode }) };
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
    timer.stop();
  });

  it('stops the timer', () => {
    const PomodoroTimer = require('../scripts/core/pomodoro.js');
    const timer = new PomodoroTimer(createMockConfig(), createMockNotifier(), createMockBGM());
    timer.start();
    timer.stop();
    assert.strictEqual(timer.status().phase, 'stopped');
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
    assert.strictEqual(timer._getBreakType(1), 'short_break');
    assert.strictEqual(timer._getBreakType(3), 'short_break');
    assert.strictEqual(timer._getBreakType(4), 'long_break');
    assert.strictEqual(timer._getBreakType(8), 'long_break');
  });
});
