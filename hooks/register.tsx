import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Janela, Medida } from '../types'

const PANE = 'painel-contexto'
// Troque a etiqueta quando os campos de Medida mudarem: ela recusa o que uma
// versão anterior guardou, e isso sobrevive à recarga.
const medida = atom({ plugin: 'painel-contexto', key: 'medida' } as const, null, {
  shape: 'medida-1',
})

// Limiares de contexto. São heurística de comunidade, não números da
// documentação oficial: compactar cedo, com foco, antes do limite automático.
const ATENCAO = 60
const CRITICO = 80

// Chaves do tema, não cores: cada tema decide o tom de cada faixa.
const VERDE = 'success'
const AMARELO = 'warning'
const VERMELHO = 'error'

const corDoContexto = (p: number) =>
  p >= CRITICO ? VERMELHO : p >= ATENCAO ? AMARELO : VERDE
const corDoUso = (p: number) => (p >= 90 ? VERMELHO : p >= 70 ? AMARELO : VERDE)

const barra = (percent: number, largura: number) => {
  const cheio = Math.round((Math.min(100, Math.max(0, percent)) / 100) * largura)

  return '█'.repeat(cheio) + '░'.repeat(largura - cheio)
}

const reinicio = (iso: string | undefined, agora: number) => {
  if (!iso) return ''
  const min = Math.max(0, Math.round((Date.parse(iso) - agora) / 60000))
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60

  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}min` : `${m}min`
}

const conselho = (p: number | undefined) => {
  if (p === undefined) return 'Aguardando a primeira resposta.'
  if (p >= CRITICO)
    return 'Compacte agora: /compact com foco no que importa. Tarefa nova e sem relação? Use /clear.'
  if (p >= ATENCAO)
    return 'Considere /compact com instruções de foco antes de chegar ao limite automático.'

  return 'Contexto saudável. Uma tarefa por sessão ajuda a mantê-lo assim.'
}

const kb = (n: number | undefined) =>
  n === undefined ? '?' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

async function atualizar($: EngineInterface) {
  const u = await $.session.usage()
  const valor: Medida = {
    percent: u.context.percent,
    tokens: u.context.tokens,
    window: u.context.window,
    janelas: u.rateLimits.map(j => ({
      kind: j.kind,
      percentUsed: j.percentUsed,
      resetsAt: j.resetsAt,
    })),
    usd: u.cost?.usd,
  }
  await update($, medida, () => valor)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'painel-contexto',
      description: 'Abre o painel de contexto e de uso ao lado do chat',
    })
    void $.ui.open({ id: PANE, title: 'Contexto e uso' })
    await atualizar($)
    // Mantém a contagem regressiva do reinício em dia entre as respostas.
    $.clock.every(60000, () => atualizar($))

    return next(e)
  })

  on('command.run', { command: 'painel-contexto' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Contexto e uso' })

    return { text: 'Painel aberto.' }
  })

  on('session.measure', async ($, e, next) => {
    await atualizar($)

    return next(e)
  })

  // O /clear abre uma sessão nova sem disparar session.start, com o estado
  // vazio: sem isto o painel esperaria o relógio ou a primeira resposta.
  // Sem await, para não segurar o início da sessão; a falha só adia a medição.
  on('classic.SessionStart', ($, e, next) => {
    if (e.source === 'clear') void atualizar($).catch(() => {})

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const m = await read($, medida)
    const agora = await $.clock.now()
    const largura = Math.max(10, Math.min(40, (e.props?.bodyColumns ?? 30) - 8))

    if (!m) return <Text dimColor>Sem medição ainda.</Text>

    const linha = (rotulo: string, j: Janela | undefined) => (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>{rotulo}</Text>
        {j ? (
          <Box flexDirection="column">
            <Text color={corDoUso(j.percentUsed)}>
              {barra(j.percentUsed, largura)} {Math.round(j.percentUsed)}%
            </Text>
            <Text dimColor>reinicia em {reinicio(j.resetsAt, agora) || '—'}</Text>
          </Box>
        ) : (
          <Text dimColor>sem leitura (só em assinatura, após a 1ª resposta)</Text>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text bold>Contexto</Text>
        {m.percent === undefined ? (
          <Text dimColor>sem leitura</Text>
        ) : (
          <Text color={corDoContexto(m.percent)}>
            {barra(m.percent, largura)} {m.percent}%
          </Text>
        )}
        <Text dimColor>
          {kb(m.tokens)} de {kb(m.window)} tokens
        </Text>
        <Text>{conselho(m.percent)}</Text>
        {linha('Sessão (5 h)', m.janelas.find(j => j.kind === 'five_hour'))}
        {linha('Semana (7 dias)', m.janelas.find(j => j.kind === 'seven_day'))}
        {m.usd !== undefined && (
          <Box marginTop={1}>
            <Text dimColor>Custo da sessão: US$ {m.usd.toFixed(2)}</Text>
          </Box>
        )}
      </Box>
    )
  })
}
