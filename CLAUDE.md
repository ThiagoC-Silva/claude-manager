# claude-manager

Repositório do mod `cc-manager` do Claude Code: um painel ao lado do chat com o uso do contexto e os limites de 5 horas e da semana. O repositório também é o marketplace de onde o mod é instalado (`.claude-plugin/marketplace.json`, `source: "./"`).

## Onde editar

- Edite sempre aqui, em `~/claude-manager`. `~/.claude/mods/claude-manager` é um link para esta pasta, e o `settings.json` carrega o mod por esse caminho (`CLAUDE_CODE_PLUGIN_DIRS`): a sessão recarrega o mod quando os arquivos mudam.
- Não crie cópia do mod em `~/.claude/dev-mods/`. Ao usar a skill `plugin-authoring`, aplique as orientações dela a esta pasta.
- Nas outras máquinas, o mod é instalado pelo `/plugin` e não deve ser editado lá.

## Estrutura

- `.claude-plugin/plugin.json`: manifesto (nome, versão, descrição, `types`).
- `.claude-plugin/marketplace.json`: lista o mod para instalação.
- `hooks/hooks.json`: aponta para `./register.tsx`.
- `hooks/register.tsx`: o módulo de hooks, com toda a lógica e o desenho do painel.
- `types/index.d.ts`: contrato de tipos; declara cada valor de `$.state` em `PluginState['cc-manager']`.
- `.claude-plugin/types/`: tipos gerados pelo Claude Code e ignorados pelo git. Não edite. Para consultar a API, procure em `.claude-plugin/types/claude-code/index.d.ts` (`'tool.call'`, `Pane: {` etc.).

## Padrões do código

- Identificadores, comentários e textos da interface em português do Brasil.
- Comentários só onde explicam um porquê não óbvio, como os que já existem.
- Cores só pela `PALETA` (Voltage) no topo de `register.tsx`; nada de hex nem chave do tema fora dela. Os cartões pintam o próprio fundo (`vazio`), por isso as cores fixas não dependem do tema. Cartões com `borderStyle={RAIO}` (cantos arredondados).
- Estado com `atom({ plugin: 'cc-manager', key }, inicial, { shape })`. Lido com `read` ao desenhar e alterado com `update`. Cada chave nova vai também em `types/index.d.ts`.
- Ao mudar os campos de um valor guardado (ex.: `Medida`), troque a etiqueta `shape` (`medida-1` → `medida-2`), para que o estado antigo seja recusado em vez de quebrar o desenho.
- Hooks que só observam terminam em `return next(e)`. Trabalho que não pode segurar a sessão roda sem `await`, com `void ...catch(() => {})`.
- Ids e nomes que se repetem (painel, comando) ficam em constantes no topo, como `PANE`.
- O nome do mod (`cc-manager`) aparece em `plugin.json`, `marketplace.json`, `types/index.d.ts` e nos `atom`. Mude em todos ou em nenhum. Nomes de plugin não podem começar com `claude-` nem `anthropic-`.

## Verificar antes do commit

```
claude plugin validate .      # deve terminar em "Validation passed"
tsc -p .                      # type-check (requer TypeScript instalado)
claude plugin test .          # se houver testes *.test.ts em tests/
```

Os avisos de LICENSE e ícone só importam para publicar no diretório oficial de plugins.

## Publicar

1. Aumente `version` em `.claude-plugin/plugin.json` (semver: correção → patch, recurso → minor).
2. Commit e push para `main`. Nunca use force push.
3. Nas outras máquinas: `/plugin` → atualizar o marketplace `claude-manager`. Instalação nova:
   `/plugin install cc-manager --marketplace ThiagoC-Silva/claude-manager`
