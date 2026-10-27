export type Janela = { kind: string; percentUsed: number; resetsAt?: string }

export type Medida = {
  percent?: number
  tokens?: number
  window: number
  janelas: Janela[]
  usd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'cc-manager': { medida: Shaped<Medida | null> }
  }
}
