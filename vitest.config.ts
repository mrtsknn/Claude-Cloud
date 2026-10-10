import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Agent worktrees live under .claude/; never run their copies of the tests.
  test: { exclude: ['**/node_modules/**', '**/dist/**', '.claude/**'] },
});
