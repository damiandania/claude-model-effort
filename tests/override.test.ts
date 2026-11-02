import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type T = Parameters<TestBody>

const BAND = {
  plugin: 'model-effort',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'desktop',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 6 },
    view: {},
  },
} as const

type Session = {
  model: string
  effort: string
  commands: string[]
  sent: { model?: string; effort?: unknown }[]
  failCommands: boolean
}

// Stands for the engine: the session's model and effort, which `/model` and `/effort`
// change, and the requests it would send.
function engine(on: T[1], failCommands = false): Session {
  const s: Session = { model: 'claude-opus-5-5', effort: 'high', commands: [], sent: [], failCommands }
  on('turn.step', async function* (_, e) {
    s.sent.push({ model: e.model, effort: e.effort })
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] } as never
  })
  on('command.run', (_, e) => {
    if (e.command === 'model-effort') return { text: '' }
    if (s.failCommands) throw new Error('refused')
    s.commands.push(`/${e.command} ${e.args}`)
    if (e.command === 'model') s.model = e.args
    if (e.command === 'effort') s.effort = e.args
    return { text: '' }
  })
  on('session.model', () => ({ value: s.model }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'model-effort' } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return s
}

// One main-loop request on whatever the session runs on now; returns what reached the bottom.
async function send($: T[0], s: Session) {
  const stream = $.turn.step({ turnId: 't', index: 0, model: s.model, effort: s.effort as 'high', messageCount: 1 })
  for await (const _ of stream) {
    // drain
  }
  return s.sent[s.sent.length - 1]
}

type Ui = {
  resize: (s: { columns: number; rows: number; in: string }) => Promise<void>
  pointer: (e: { type: 'down' | 'up'; x: number; y: number; button: 'left'; in: string }) => Promise<void>
}

// A drag on one slider that ends on the cell `x` of a 30-cell region.
async function drag(ui: Ui, slider: string, x: number) {
  await ui.resize({ columns: 30, rows: 1, in: slider })
  await ui.pointer({ type: 'down', x, y: 0, button: 'left', in: slider })
  await ui.pointer({ type: 'up', x, y: 0, button: 'left', in: slider })
}

async function start($: T[0], s: Session) {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await send($, s)
  return $.ui.mount(BAND)
}

test('with nothing picked the session model and effort go through unchanged', async ($, on) => {
  const s = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const sent = await send($, s)

  expect(sent?.model).toBe('claude-opus-5-5')
  expect(sent?.effort).toBe('high')
})

test('dragging runs /model and /effort, so the session itself changes', async ($, on) => {
  const s = engine(on)
  const ui = await start($, s)

  await drag(ui, 'model-slider', 0)
  await drag(ui, 'effort-slider', 7)

  expect(s.commands).toEqual(['/model claude-haiku-4-5-20251001', '/effort medium'])
  const sent = await send($, s)
  expect(sent?.model).toBe('claude-haiku-4-5-20251001')
  expect(sent?.effort).toBe('medium')
  await ui.unmount()
})

test('dragging to what the session already runs runs no command', async ($, on) => {
  const s = engine(on)
  const ui = await start($, s)

  await drag(ui, 'effort-slider', 15)

  expect(s.commands).toEqual([])
  await ui.unmount()
})

test('when the commands are refused, each request is rewritten instead', async ($, on) => {
  const s = engine(on, true)
  const ui = await start($, s)

  await drag(ui, 'model-slider', 0)
  await drag(ui, 'effort-slider', 29)
  const sent = await send($, s)

  expect(sent?.model).toBe('claude-haiku-4-5-20251001')
  expect(sent?.effort).toBe('max')
  await ui.unmount()
})
