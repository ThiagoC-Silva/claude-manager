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
// Limiar de atenção dos limites de 5 horas e da semana.
const ATENCAO_USO = 70

// Paleta Brasa: carvão em relevo e um degradê laranja → vermelho → magenta.
// Cores fixas, não chaves do tema: os cartões pintam o próprio fundo, então o
// contraste não depende do tema da pessoa.
const PALETA = {
  fundo: '#1C1C1E', // carvão: corpo do painel
  cartao: '#262628', // um tom acima do fundo, como relevo
  borda: '#34343A', // quase a cor do cartão: sugere o relevo sem contornar
  pilula: '#161618', // etiqueta afundada no cartão
  laranja: '#F7931E', // início do degradê: folga
  vermelho: '#E8262B', // meio do degradê: atenção
  magenta: '#A3286F', // fim do degradê: limite
  texto: '#E4E4E6',
  apagado: '#7C7C82',
  trilho: '#38383C', // parte vazia das barras
} as const

const RAIO = 'round'
// O fundo dos cartões não cobre o corpo do painel (as margens entre eles e o
// que sobra embaixo): esse é pintado pela superfície, pedido aqui.
const ABRIR = { id: PANE, title: 'Contexto e uso', backgroundColor: PALETA.fundo }
const ICONE = '●'
const SEPARADOR = ' ┃ '

// Algarismos de três linhas para o número do contexto, só no terminal: nas
// outras superfícies a fonte pode não ser monoespaçada e o desenho se desfaz.
const ALGARISMOS: Record<string, [string, string, string]> = {
  '0': ['┏━┓', '┃ ┃', '┗━┛'],
  '1': ['╺┓ ', ' ┃ ', '╺┻╸'],
  '2': ['┏━┓', '┏━┛', '┗━╸'],
  '3': ['╺━┓', ' ━┫', '╺━┛'],
  '4': ['╻ ╻', '┗━┫', '  ╹'],
  '5': ['┏━╸', '┗━┓', '╺━┛'],
  '6': ['┏━╸', '┣━┓', '┗━┛'],
  '7': ['╺━┓', '  ┃', '  ╹'],
  '8': ['┏━┓', '┣━┫', '┗━┛'],
  '9': ['┏━┓', '┗━┫', '╺━┛'],
}

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

const misturar = (a: string, b: string, t: number) => {
  const [de, para] = [rgb(a), rgb(b)]

  return `#${de
    .map((c, i) => Math.round(c + (para[i] - c) * t).toString(16).padStart(2, '0'))
    .join('')}`
}

// O degradê vai de laranja a vermelho até o limiar de atenção e de vermelho a
// magenta depois dele: a cor da ponta da barra já diz o estado.
const degrade = (percent: number, atencao: number) => {
  const p = Math.min(100, Math.max(0, percent))

  return p <= atencao
    ? misturar(PALETA.laranja, PALETA.vermelho, p / atencao)
    : misturar(PALETA.vermelho, PALETA.magenta, (p - atencao) / (100 - atencao))
}

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
    void $.ui.open(ABRIR)
    await atualizar($)
    // Mantém a contagem regressiva do reinício em dia entre as respostas.
    $.clock.every(60000, () => atualizar($))

    return next(e)
  })

  on('command.run', { command: 'cc-manager' }, async $ => {
    await $.ui.open(ABRIR)

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
        backgroundColor={PALETA.cartao}
        paddingX={1}
        marginTop={topo}
      >
        {filhos}
      </Box>
    )

    // Rótulo, barra vermelha e etiqueta afundada, como as abas da referência.
    const titulo = (rotulo: string, etiqueta: string) => (
      <Text>
        <Text color={PALETA.texto} bold>
          {rotulo}
        </Text>
        <Text color={PALETA.vermelho}>{SEPARADOR}</Text>
        <Text color={PALETA.laranja} backgroundColor={PALETA.pilula} bold>
          {` ${etiqueta} `}
        </Text>
      </Text>
    )

    const porcento = (percent: number | undefined, cor: string) => (
      <Text color={percent === undefined ? PALETA.apagado : cor} bold>
        {percent === undefined ? '--%' : `${String(Math.round(percent)).padStart(3)}%`}
      </Text>
    )

    // Cada célula cheia toma a cor do degradê na sua posição, então a barra
    // só chega ao magenta quando passa do limiar de atenção.
    const barra = (percent: number | undefined, atencao: number) => {
      const cheio = percent === undefined ? 0 : preenchido(percent, largura)

      return (
        <Text>
          {Array.from({ length: cheio }, (_, i) => (
            <Text color={degrade(((i + 0.5) / largura) * 100, atencao)}>━</Text>
          ))}
          <Text color={PALETA.trilho}>{'━'.repeat(largura - cheio)}</Text>
        </Text>
      )
    }

    // O número grande escurece de cima para baixo até a cor da ponta da barra.
    const numeroGrande = (percent: number | undefined, cor: string) => {
      if (percent === undefined || e.surface !== 'terminal')
        return porcento(percent, cor)

      const digitos = String(Math.round(percent)).split('')

      return (
        <Box flexDirection="column">
          {[0, 1, 2].map(linha => (
            <Text>
              <Text color={misturar(PALETA.laranja, cor, linha / 2)} bold>
                {digitos.map(d => ALGARISMOS[d][linha]).join('')}
              </Text>
              {linha === 2 && <Text color={PALETA.texto}> %</Text>}
            </Text>
          ))}
        </Box>
      )
    }

    if (!m)
      return cartao(<Text color={PALETA.apagado}>{ICONE} aguardando medição…</Text>)

    const janela = (rotulo: string, etiqueta: string, j: Janela | undefined) => {
      const cor = j ? degrade(j.percentUsed, ATENCAO_USO) : PALETA.apagado

      return cartao(
        <>
          <Box justifyContent="space-between">
            {titulo(rotulo, etiqueta)}
            {porcento(j?.percentUsed, cor)}
          </Box>
          {barra(j?.percentUsed, ATENCAO_USO)}
          <Text color={PALETA.apagado}>
            {j
              ? `reinicia em ${reinicio(j.resetsAt, agora) || '—'}`
              : 'sem leitura · só em assinatura, após a 1ª resposta'}
          </Text>
        </>,
        1,
      )
    }

    const corCtx = m.percent === undefined ? PALETA.apagado : degrade(m.percent, ATENCAO)

    return (
      <Box flexDirection="column">
        {cartao(
          <>
            {numeroGrande(m.percent, corCtx)}
            <Text color={PALETA.apagado}>
              contexto · {kb(m.tokens)} / {kb(m.window)} tokens
            </Text>
            {barra(m.percent, ATENCAO)}
            <Box marginTop={1}>
              <Text color={PALETA.texto}>
                <Text color={corCtx}>› </Text>
                {conselho(m.percent)}
              </Text>
            </Box>
          </>,
        )}
        {janela('Sessão', '5h', m.janelas.find(j => j.kind === 'five_hour'))}
        {janela('Semana', '7d', m.janelas.find(j => j.kind === 'seven_day'))}
        {m.usd !== undefined &&
          cartao(
            <Box justifyContent="space-between">
              {titulo('Custo', 'sessão')}
              <Text color={PALETA.laranja} bold>
                US$ {m.usd.toFixed(2)}
              </Text>
            </Box>,
            1,
          )}
      </Box>
    )
  })
}
