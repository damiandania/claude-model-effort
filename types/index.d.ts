export type Effort = '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

declare module 'claude-code' {
  interface PluginState {
    'model-effort': {
      model: string
      effort: Effort
      sessionModel: string
      sessionEffort: string
      isHidden: boolean
      sliderReady: string[]
      models: string[]
    }
  }
}
