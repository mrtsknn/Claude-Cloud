import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Agent worktrees live under .claude/; never run their copies of the tests.
  // Level-pack tests validate hundreds of generated levels; give them room on a busy machine.
  test: { exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'], testTimeout: 60_000 },
});
