import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ESLint } from 'eslint'

test('patched minimatch preserves TS/TSX lint discovery and violation rejection', async () => {
  const eslint = new ESLint()
  const results = await eslint.lintFiles(['src'])
  assert.ok(results.some(({ filePath }) => filePath.endsWith('/App.tsx')))
  assert.ok(results.some(({ filePath }) => filePath.endsWith('/game/engine.ts')))
  assert.equal(results.reduce((count, result) => count + result.errorCount, 0), 0)
  const [invalid] = await eslint.lintText('const unused: number = 1\n', { filePath: 'src/security-fixture.ts' })
  assert.ok(invalid.messages.some(({ ruleId }) => ruleId === '@typescript-eslint/no-unused-vars'))
})
