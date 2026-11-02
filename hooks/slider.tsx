import type { ClientModule } from 'claude-code'

type Props = {
  count: number
  selected: number
  color: string
  dim: string
}
// `drag` is a local preview; it only counts while the plugin's `selected` is still
// the one it was dragged from, so a reset or a pick from elsewhere wins.
type State = { drag?: number; from: number; current: { selected: number } }

// Drawn as `[━━━━●  •  •  •]`, one character per cell between the brackets.
const Slider: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const { count, color, dim } = props
  const last = Math.max(1, count - 1)
  const inner = Math.max(count * 3, surface.columns - 2)
  const stopCol = (i: number) => Math.round((i / last) * (inner - 1))

  if (surface.state === undefined) {
    // Listeners are set once, so they read the latest props through this holder.
    const current = { selected: props.selected }
    surface.setState({ from: props.selected, current })
    surface.post({ type: 'ready' })
    const stopAt = (x: number) => {
      const width = Math.max(count * 3, surface.columns - 2)
      return Math.min(last, Math.max(0, Math.round(((x - 1) / Math.max(1, width - 1)) * last)))
    }
    const preview = (drag: number) => surface.setState({ drag, from: current.selected, current })
    surface.onPointer(ev => {
      if (ev.type === 'down' || (ev.type === 'move' && ev.button)) {
        preview(stopAt(ev.fine?.x ?? ev.x))
      } else if (ev.type === 'up') {
        const stop = stopAt(ev.fine?.x ?? ev.x)
        preview(stop)
        surface.post({ type: 'pick', index: stop })
      }
    })
    surface.onKey(ev => {
      const s = surface.state
      const at = s?.drag !== undefined && s.from === current.selected ? s.drag : current.selected
      const to = ev.key === 'left' ? at - 1 : ev.key === 'right' ? at + 1 : at
      if (to !== at && to >= 0 && to <= last) {
        preview(to)
        surface.post({ type: 'pick', index: to })
      }
    })
  } else {
    surface.state.current.selected = props.selected
  }

  const s = surface.state
  const at = s?.drag !== undefined && s.from === props.selected ? s.drag : props.selected
  const knob = at >= 0 ? stopCol(at) : -1
  const stops = new Set(Array.from({ length: count }, (_, i) => stopCol(i)))

  let filled = ''
  let rest = ''
  for (let c = 0; c < inner; c++) {
    if (c < knob) filled += '━'
    else if (c > knob) rest += stops.has(c) ? '•' : ' '
  }

  return (
    <Box flexDirection="row">
      <Text mono color={dim}>[</Text>
      <Text mono color={color}>{filled}</Text>
      {knob >= 0 && <Text mono color={color}>●</Text>}
      <Text mono color={dim}>{rest}</Text>
      <Text mono color={dim}>]</Text>
    </Box>
  )
}

export default Slider
