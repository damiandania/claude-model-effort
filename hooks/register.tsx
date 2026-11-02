import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Effort } from '../types'

// Overrides picked in the band; '' means "use the session's".
const model = atom({ plugin: 'model-effort', key: 'model' } as const, '')
const effort = atom({ plugin: 'model-effort', key: 'effort' } as const, '' as Effort)
// What the session itself runs on, read from each main-loop request before any override.
const sessionModel = atom({ plugin: 'model-effort', key: 'sessionModel' } as const, '')
const sessionEffort = atom({ plugin: 'model-effort', key: 'sessionEffort' } as const, '')
const isHidden = atom({ plugin: 'model-effort', key: 'isHidden' } as const, false)
// Surfaces where the draggable slider has reported drawing; elsewhere stop buttons show.
const sliderReady = atom({ plugin: 'model-effort', key: 'sliderReady' } as const, [] as string[])
// Model ids offered in the picker this session: the seeds plus every model seen running.
const models = atom({ plugin: 'model-effort', key: 'models' } as const, [] as string[])

const STORE_MODELS = 'models'
// No API lists the app's models, so these seed the picker; models seen in use join it.
const SEED_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001']
const FAMILY_ORDER = ['haiku', 'sonnet', 'opus', 'fable']

const FG = '#E5E5EA'
const DIM = '#8E8E93'

const EFFORTS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max' },
] as const

function family(id: string): string {
  return /^claude-([a-z]+)/.exec(id)?.[1] ?? id
}

// "claude-opus-5-5" reads as "Opus 5.5"; a dated id drops its date.
function shortModel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id)
  if (!m || !m[1]) return id
  const name = m[1].charAt(0).toUpperCase() + m[1].slice(1)
  return m[3] ? `${name} ${m[2]}.${m[3]}` : `${name} ${m[2]}`
}

function sortModels(ids: string[]): string[] {
  const rank = (id: string) => {
    const i = FAMILY_ORDER.indexOf(family(id))
    return i < 0 ? FAMILY_ORDER.length : i
  }
  return [...new Set(ids)].filter(id => id.startsWith('claude-')).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

// The model slider's stops, cheapest on the left: known models, the session's and the override.
async function modelStops($: EngineInterface): Promise<string[]> {
  const sm = (await $.session.model()) || (await read($, sessionModel))
  const m = await read($, model)
  return sortModels([...(await read($, models)), sm, ...(m ? [m] : [])])
}

async function rememberModel($: EngineInterface, id: string) {
  if (!id.startsWith('claude-')) return
  const list = await read($, models)
  if (list.includes(id)) return
  const next = sortModels([...list, id])
  await update($, models, () => next)
  await $.store.set(STORE_MODELS, next)
}

// A pick runs `/model` or `/effort` as if typed, so the session itself (and the app's
// own picker) changes. Only if that fails does the pick fall back to rewriting each request.
async function pickModel($: EngineInterface, id: string) {
  const sm = (await $.session.model()) || (await read($, sessionModel))
  if (id === sm) {
    await update($, model, () => '')
    return
  }
  try {
    await $.command.run({ command: 'model', args: id })
    await update($, sessionModel, () => id)
    await update($, model, () => '')
  } catch {
    await update($, model, () => id)
    $.ui.toast(`Could not switch the session to ${shortModel(id)}; applying it to each request instead.`)
  }
}

async function pickEffort($: EngineInterface, index: number) {
  const picked = EFFORTS[index]
  if (!picked) return
  const se = await read($, sessionEffort)
  if (picked.value === se) {
    await update($, effort, () => '' as Effort)
    return
  }
  try {
    await $.command.run({ command: 'effort', args: picked.value })
    await update($, sessionEffort, () => picked.value)
    await update($, effort, () => '' as Effort)
  } catch {
    await update($, effort, () => picked.value)
    $.ui.toast(`Could not set the session effort to ${picked.label}; applying it to each request instead.`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'model-effort',
      description: 'Show or hide the model and effort bar',
    })
    const stored = await $.store.get(STORE_MODELS)
    const saved = Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string') : []
    const current = await $.session.model()
    await update($, sessionModel, prev => prev || current)
    await update($, models, () => sortModels([...SEED_MODELS, ...saved, current]))
    void $.ui.close({ id: 'model-effort' })

    // Picks left over from the version that only rewrote requests move onto the session.
    const leftModel = await read($, model)
    const leftEffort = await read($, effort)
    if (leftModel) void pickModel($, leftModel)
    if (leftEffort) {
      const i = EFFORTS.findIndex(o => o.value === leftEffort)
      if (i >= 0) void pickEffort($, i)
    }

    return next(e)
  })

  on('command.run', { command: 'model-effort' }, async $ => {
    const hidden = await update($, isHidden, prev => !prev)

    return { text: hidden ? 'Model and effort bar hidden.' : 'Model and effort bar shown.' }
  })

  // Subagents keep the model and effort they were given.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId) {
      return yield* next(e)
    }
    const seenModel = e.model
    const seenEffort = e.effort === undefined ? '' : String(e.effort)
    await update($, sessionModel, prev => (prev === seenModel ? prev : seenModel))
    await update($, sessionEffort, prev => (prev === seenEffort ? prev : seenEffort))
    await rememberModel($, seenModel)

    const m = await read($, model)
    const ef = await read($, effort)

    return yield* next({
      ...e,
      ...(m ? { model: m } : {}),
      ...(ef ? { effort: ef } : {}),
    })
  })

  on('ui.message', async ($, e, next) => {
    if (!e.module.endsWith('slider.tsx')) {
      return next(e)
    }
    const data = e.data as { type?: unknown; index?: unknown } | null
    if (data?.type === 'ready') {
      await update($, sliderReady, list => (list.includes(e.surface) ? list : [...list, e.surface]))
    } else if (data?.type === 'pick' && typeof data.index === 'number') {
      if (e.element === 'effort-slider') {
        await pickEffort($, data.index)
      } else if (e.element === 'model-slider') {
        const id = (await modelStops($))[data.index]
        if (id) await pickModel($, id)
      }
    }

    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }
    const el = $.ui.resolve(e)
    const { Box, Text, Button } = el
    const Client = 'Client' in el ? el.Client : undefined
    const sliderWorks = Client !== undefined && (await read($, sliderReady)).includes(e.surface)

    const m = await read($, model)
    const ef = await read($, effort)
    const sm = (await $.session.model()) || (await read($, sessionModel))
    const se = await read($, sessionEffort)
    const list = await modelStops($)

    const modelIndex = list.indexOf(m || sm)
    const modelLabel = shortModel(m || sm)
    const effortIndex = EFFORTS.findIndex(o => o.value === (ef || se))
    const effortLabel = EFFORTS[effortIndex]?.label ?? '—'
    const isOverriding = m !== '' || ef !== ''

    // The draggable slider, or stop buttons drawn the same way where it does not draw.
    const slider = (id: string, labels: string[], at: number, pick: (i: number) => unknown) => (
      <Box flexGrow={1} flexShrink={1} minWidth={12}>
        {Client && (
          <Client key={`${id}-slider`} module="./slider.tsx" width="100%" props={{ count: labels.length, selected: at, color: FG, dim: DIM }} />
        )}
        <Box flexDirection="row" display={sliderWorks ? 'none' : 'flex'}>
          <Text mono color={DIM}>[</Text>
          {labels.map((label, i) => (
            <Button key={`${id}-btn-${i}`} label={label} plain onPress={() => pick(i)}>
              <Text mono color={i <= at ? FG : DIM}>
                {i === 0 ? '' : i <= at ? '━━━' : '  '}
                {i === at ? '●' : '•'}
              </Text>
            </Button>
          ))}
          <Text mono color={DIM}>]</Text>
        </Box>
      </Box>
    )

    // Fixed widths so the sliders do not shift as the names change.
    const name = (text: string, align: 'flex-start' | 'center' | 'flex-end') => (
      <Box width={10} flexShrink={0} justifyContent={align}>
        <Text mono size="caption" color={FG}>{text}</Text>
      </Box>
    )

    return (
      <Box flexDirection="row" alignItems="center" width="100%" gap="md">
        <Box flexDirection="row" alignItems="center" flexGrow={1} width="50%" gap="sm">
          {slider('model', list.map(shortModel), modelIndex, i => {
            const id = list[i]
            return id ? pickModel($, id) : undefined
          })}
          {name(modelLabel, 'flex-start')}
        </Box>

        <Text mono size="caption" color={DIM}>│</Text>

        <Box flexDirection="row" alignItems="center" flexGrow={1} width="50%" gap="sm">
          {name(effortLabel, 'center')}
          {slider('effort', EFFORTS.map(o => o.label), effortIndex, i => pickEffort($, i))}
        </Box>

        <Button
          key="reset"
          plain
          dimColor={!isOverriding}
          onPress={async () => {
            await update($, model, () => '')
            await update($, effort, () => '' as Effort)
          }}
        >
          <Text mono>↺</Text>
        </Button>
      </Box>
    )
  })
}
