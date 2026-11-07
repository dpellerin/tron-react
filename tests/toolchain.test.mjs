import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createServer } from 'vite'

test('Vite serves public files but never exposes denied files through raw queries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'game-toolchain-'))
  let server
  try {
    await writeFile(path.join(root, 'public.txt'), 'public-fixture')
    await writeFile(path.join(root, '.env'), 'SYNTHETIC_SECURITY_MARKER=not-a-secret')
    server = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0, fs: { strict: true, allow: [root] } },
    })
    await server.listen()
    const origin = server.resolvedUrls.local[0]
    const publicFile = await fetch(new URL('public.txt', origin))
    assert.equal(publicFile.status, 200)
    assert.equal(await publicFile.text(), 'public-fixture')
    for (const query of ['', '?raw', '?import&raw', '?import&url&inline']) {
      const response = await fetch(new URL(`.env${query}`, origin))
      assert.equal(response.status, 403, query || 'plain request')
      assert.ok(!(await response.text()).includes('SYNTHETIC_SECURITY_MARKER'))
    }
  } finally {
    await server?.close()
    await rm(root, { recursive: true, force: true })
  }
})
