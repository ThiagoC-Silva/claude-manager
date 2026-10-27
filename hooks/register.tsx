import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderNode } from 'claude-code'

import type { Janela, Medida } from '../types'

const PANE = 'cc-manager'
// Troque a etiqueta quando os campos de Medida mudarem: ela recusa o que uma
// versão anterior guardou, e isso sobrevive à recarga.
const medida = atom({ plugin: 'cc-manager', key: 'medida' } as const, null, {
  shape: 'medida-1',
})

// Limiares de contexto. São heurística de comunidade, não números da
// documentação oficial: compactar cedo, com foco, antes do limite automático.
const ATENCAO = 60
const CRITICO = 80

// Paleta Voltage. Cores fixas, não chaves do tema: os cartões pintam o
// próprio fundo (vazio), então o contraste não depende do tema da pessoa.
const PALETA = {
  vazio: '#0D0500', // Dark Void: fundo dos cartões
  carmesim: '#FF4500', // Electric Crimson: crítico
  ambar: '#FFAA00', // Amber Flash: títulos e destaques
  amarelo: '#FFE600', // Neon Yellow: atenção
  verde: '#00FF85', // Electric Green: saudável
  texto: '#F5E9DC',
  apagado: '#8C7B6B',
  trilho: '#3D2A14', // parte vazia das barras
  borda: '#7A4100', // âmbar escurecido: o brilho fica para os dados
} as const

const RAIO = 'round'
const ICONE = 'ϟ'

const corDoContexto = (p: number) =>
  p >= CRITICO ? PALETA.carmesim : p >= ATENCAO ? PALETA.amarelo : PALETA.verde
const corDoUso = (p: number) =>
  p >= 90 ? PALETA.carmesim : p >= 70 ? PALETA.amarelo : PALETA.verde

const preenchido = (percent: number, largura: number) =>
  Math.round((Math.min(100, Math.max(0, percent)) / 100) * largura)

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
      name: 'cc-manager',
      description: 'Abre o painel de contexto e de uso ao lado do chat',
    })
    void $.ui.open({ id: PANE, title: 'Contexto e uso' })
    await atualizar($)
    // Mantém a contagem regressiva do reinício em dia entre as respostas.
    $.clock.every(60000, () => atualizar($))

    return next(e)
  })

  on('command.run', { command: 'cc-manager' }, async $ => {
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
    // Borda (2) e respiro lateral (2) do cartão.
    const largura = Math.max(10, Math.min(40, (e.props?.bodyColumns ?? 30) - 4))

    const cartao = (filhos: RenderNode, topo = 0) => (
      <Box
        flexDirection="column"
        borderStyle={RAIO}
        borderColor={PALETA.borda}
        backgroundColor={PALETA.vazio}
        paddingX={1}
        marginTop={topo}
      >
        {filhos}
      </Box>
    )

    const cabecalho = (rotulo: string, percent: number | undefined, cor: string) => (
      <Box justifyContent="space-between">
        <Text color={PALETA.ambar} bold>
          {rotulo}
        </Text>
        <Text color={percent === undefined ? PALETA.apagado : cor} bold>
          {percent === undefined ? '--%' : `${String(Math.round(percent)).padStart(3)}%`}
        </Text>
      </Box>
    )

    const barra = (percent: number | undefined, cor: string) => {
      const cheio = percent === undefined ? 0 : preenchido(percent, largura)

      return (
        <Text>
          <Text color={cor}>{'━'.repeat(cheio)}</Text>
          <Text color={PALETA.trilho}>{'─'.repeat(largura - cheio)}</Text>
        </Text>
      )
    }

    if (!m)
      return cartao(<Text color={PALETA.apagado}>{ICONE} aguardando medição…</Text>)

    const janela = (rotulo: string, j: Janela | undefined) => {
      const cor = j ? corDoUso(j.percentUsed) : PALETA.apagado

      return cartao(
        <>
          {cabecalho(rotulo, j?.percentUsed, cor)}
          {barra(j?.percentUsed, cor)}
          <Text color={PALETA.apagado}>
            {j
              ? `reinicia em ${reinicio(j.resetsAt, agora) || '—'}`
              : 'sem leitura · só em assinatura, após a 1ª resposta'}
          </Text>
        </>,
        1,
      )
    }

    const corCtx = m.percent === undefined ? PALETA.apagado : corDoContexto(m.percent)

    return (
      <Box flexDirection="column">
        {cartao(
          <>
            {cabecalho(`${ICONE} CONTEXTO`, m.percent, corCtx)}
            {barra(m.percent, corCtx)}
            <Text color={PALETA.apagado}>
              {kb(m.tokens)} / {kb(m.window)} tokens
            </Text>
            <Box marginTop={1}>
              <Text color={PALETA.texto}>
                <Text color={corCtx}>› </Text>
                {conselho(m.percent)}
              </Text>
            </Box>
          </>,
        )}
        {janela('// SESSÃO · 5H', m.janelas.find(j => j.kind === 'five_hour'))}
        {janela('// SEMANA · 7D', m.janelas.find(j => j.kind === 'seven_day'))}
        {m.usd !== undefined &&
          cartao(
            <Box justifyContent="space-between">
              <Text color={PALETA.apagado}>◆ custo da sessão</Text>
              <Text color={PALETA.ambar} bold>
                US$ {m.usd.toFixed(2)}
              </Text>
            </Box>,
            1,
          )}
      </Box>
    )
  })
}
