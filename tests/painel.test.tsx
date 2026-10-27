import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'cc-manager',
  component: 'Pane',
  requestId: 'cc-manager',
  props: {
    title: 'Contexto e uso',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('o painel desenha os cartões com a paleta', async ($, on) => {
  on('command.register', () => ({ value: { command: 'cc-manager' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: Date.parse('2029-12-31T21:30:00Z') }))
  on('session.usage', () => ({
    value: {
      context: { percent: 72, tokens: 144000, window: 200000 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 95, resetsAt: '2030-01-01T00:00:00Z' },
        { kind: 'seven_day', percentUsed: 12 },
      ],
      cost: { usd: 1.5 },
    },
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect((await ui.find({ type: 'Text', text: /^contexto/ }))?.text).toBe(
      'contexto · 144.0k / 200.0k tokens',
    )
    // O número grande é desenhado só no terminal; nas outras superfícies, texto.
    if (surface === 'terminal')
      expect((await ui.find({ type: 'Text', text: /^╺━┓┏━┓$/ }))?.text).toBe('╺━┓┏━┓')
    else expect((await ui.find({ type: 'Text', text: /^ +72%$/ }))?.text).toBe(' 72%')
    expect((await ui.find({ type: 'Text', text: /^ +95%$/ }))?.text).toBe(' 95%')
    expect((await ui.find({ type: 'Text', text: /US\$/ }))?.text).toBe('US$ 1.50')
    await ui.unmount()
  }
})
