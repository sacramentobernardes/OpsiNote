import type { AppData, Board, Entry, Section } from '../types'
import { boardFromSections, newId } from './util'

const check = (title: string, content = '', done = false): Entry => ({ id: newId(), title, content, done })
const note = (title: string, content: string): Entry => ({ id: newId(), title, content })
const section = (title: string, checklist: Entry[], notes: Entry[] = []): Section => ({
  id: newId(),
  title,
  checklist,
  notes
})

/** Variável viva da ficha dentro do texto (ver components/SheetVarNode.ts). */
const v = (key: string): string => `<span data-var="${key}">{{${key}}}</span>`

/**
 * Espaço de boas-vindas: um tutorial que se faz usando o próprio app. A ficha traz
 * variáveis de exemplo para o "/" e os snippets já funcionarem na primeira abertura.
 */
export function createWelcomeBoard(): Board {
  const board = boardFromSections(
    'Bem-vindo ao OpsiNote',
    'other',
    [
      section(
        '1 · Comece por aqui',
        [
          check(
            'Abra este espaço',
            '<p>Você já está num <strong>espaço</strong>: é onde se acompanha algo (um alvo de pentest, uma matéria, um projeto, uma lista de tarefas). Cada espaço tem <strong>seções</strong>, e cada seção tem um <strong>checklist</strong> e <strong>notas</strong>.</p><p>Marque cada item desta lista conforme for experimentando. A barra de progresso lá em cima acompanha.</p>',
            true
          ),
          check(
            'Veja a ficha do espaço',
            '<p>A <strong>Ficha</strong> é a primeira linha da árvore, à esquerda. Ela guarda as informações do espaço e as <strong>variáveis</strong>, como <code>ip</code> e <code>site</code>.</p><p>A categoria do espaço (Pentest, Estudo, Projeto…) muda os campos da ficha.</p>'
          ),
          check(
            'Use uma variável no texto',
            `<p>Este item mostra o IP da ficha: ${v('ip')}. Abra a <strong>Ficha</strong>, mude o valor de <code>ip</code> e volte aqui: o texto acompanha.</p><p>Para inserir uma variável, digite <code>/</code> no começo de uma palavra (ou clique no botão <code>{ }</code> da barra do editor) e escolha na lista.</p>`
          ),
          check(
            'Insira um snippet com s/',
            '<p>Snippets são comandos e textos prontos. Aqui embaixo, digite <code>s/curl</code> e aperte Enter: o comando entra já com o site da ficha.</p><p></p><p>Também dá para copiar direto da <strong>Ficha</strong> (seção Snippets) ou da tela de <strong>Snippets</strong>, no trilho.</p>'
          ),
          check(
            'Crie seu primeiro espaço',
            '<p>No <strong>Início</strong>, escolha uma categoria, ou use <code>Ctrl+Shift+N</code>. Para começar com um roteiro pronto, abra <strong>Bibliotecas</strong> e escolha <strong>Criar espaço</strong>.</p>'
          ),
          check(
            'Clique com o botão direito num espaço',
            '<p>No trilho à esquerda, no Início ou em Bibliotecas, o botão direito abre as ações do espaço: renomear, mudar a cor e a categoria, duplicar, salvar como biblioteca, exportar só ele ou excluir.</p>'
          )
        ],
        [
          note(
            'Exemplo: nota com variáveis',
            `<h2>Relatório rápido</h2><p><strong>Projeto:</strong> ${v('projeto')}</p><p><strong>Site:</strong> ${v('site')} · <strong>IP:</strong> ${v('ip')}</p><p>Os valores acima vêm da ficha. Crie outro espaço a partir de um modelo com variáveis e cada um mostra os próprios valores.</p><pre><code>curl -I https://exemplo.com</code></pre><p>Os blocos de código, como o acima, guardam o texto como foi inserido.</p>`
          )
        ]
      ),
      section('2 · Organize', [
        check(
          'Marque como concluído pelo teclado',
          '<p>Com um item aberto, <code>Ctrl+Enter</code> marca ou desmarca. <code>Alt+↑</code> e <code>Alt+↓</code> passam para o item anterior e o próximo.</p>'
        ),
        check(
          'Duplique, mova e reordene',
          '<p>O menu <strong>⋯</strong> de cada linha duplica, move para outra seção ou espaço e exclui. Itens, notas e espaços também podem ser arrastados.</p>'
        ),
        check(
          'Ache qualquer coisa com Ctrl+K',
          '<p>A busca procura em títulos e conteúdos de tudo, sem ligar para acentos, e também executa comandos: digite <code>tema</code>, <code>exportar</code> ou <code>lixeira</code>.</p>'
        ),
        check(
          'Use modelos de nota',
          '<p>Ao lado de <strong>+ Nova nota</strong>, o seletor <strong>Modelo…</strong> cria uma nota já estruturada, como um relatório de vulnerabilidade ou uma ata.</p>'
        ),
        check(
          'Desfaça uma exclusão',
          '<p>Nada some de imediato: logo depois de excluir aparece <strong>Desfazer</strong>, e a <strong>Lixeira</strong> guarda tudo por 30 dias.</p>'
        ),
        check(
          'Personalize os atalhos',
          '<p>Em <strong>Configurações → Atalhos</strong>, clique num atalho e pressione a combinação que preferir. O app avisa se ela já estiver em uso.</p>'
        )
      ]),
      section(
        '3 · Leve seus dados',
        [
          check(
            'Exporte no formato que precisar',
            '<p>Em <strong>Configurações → Dados e backup → Exportar…</strong>: backup completo (.json), página HTML para imprimir em PDF, Markdown, planilha CSV ou texto simples. Dá para escolher só alguns espaços e zerar os checklists.</p>'
          ),
          check(
            'Importe de outros apps',
            '<p><strong>Importar arquivos…</strong> aceita os mesmos formatos, vários de uma vez. Notas do Obsidian (.md) viram espaços, seções e notas; uma planilha vira um checklist.</p>'
          ),
          check(
            'Saiba onde ficam seus dados',
            '<p>Tudo é salvo sozinho no seu computador, com uma cópia da versão anterior. Nada vai para a internet. O caminho aparece em <strong>Configurações → Dados e backup</strong>.</p>'
          )
        ],
        [
          note(
            'Dicas do editor',
            '<p>O editor aceita <strong>negrito</strong>, <em>itálico</em>, <u>sublinhado</u>, <s>riscado</s> e <code>código</code>.</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Listas de tarefas dentro das notas</p></li><li data-type="taskItem" data-checked="false"><p>Imagens: cole uma captura de tela com Ctrl+V ou arraste o arquivo</p></li></ul><table><tbody><tr><th><p>Para</p></th><th><p>Use</p></th></tr><tr><td><p>Variável da ficha</p></td><td><p>/ no começo da palavra</p></td></tr><tr><td><p>Snippet</p></td><td><p>s/ no começo da palavra</p></td></tr><tr><td><p>Abrir um link</p></td><td><p>Ctrl+clique</p></td></tr></tbody></table><pre><code>Blocos de código preservam a formatação</code></pre>'
          )
        ]
      )
    ],
    '#f97316'
  )
  board.sheet = {
    vars: [
      { id: newId(), key: 'projeto', value: 'Meu primeiro espaço' },
      { id: newId(), key: 'site', value: 'https://exemplo.com' },
      { id: newId(), key: 'ip', value: '192.168.0.10' }
    ],
    fields: {
      notes:
        'Esta é a ficha do espaço de boas-vindas. Mude os valores das variáveis acima e veja o item "Use uma variável no texto" e a nota "Exemplo: nota com variáveis" acompanharem.'
    }
  }
  return board
}

export function createSeedData(): AppData {
  const welcome = createWelcomeBoard()

  const pentestLib = boardFromSections(
    'Pentest Web (exemplo)',
    'pentest',
    [
      section('Reconhecimento', [
        check('Enumerar subdomínios e ativos'),
        check('Mapear endpoints e parâmetros'),
        check('Identificar tecnologias e versões')
      ]),
      section('Autenticação e sessão', [
        check('Testar limite de tentativas de login'),
        check('Verificar fluxo de recuperação de senha'),
        check('Analisar expiração e invalidação de sessão')
      ]),
      section('Validação de entrada', [
        check('Testar injeção de SQL'),
        check('Testar Cross-Site Scripting (XSS)'),
        check('Testar Server-Side Request Forgery (SSRF)')
      ])
    ],
    '#ef4444'
  )

  const studyLib = boardFromSections(
    'Plano de estudos (exemplo)',
    'study',
    [
      section('Planejamento', [
        check('Definir objetivo e prazo'),
        check('Listar materiais de referência'),
        check('Separar horários fixos na semana')
      ]),
      section('Revisão', [
        check('Resumir cada tópico com suas palavras'),
        check('Fazer exercícios práticos'),
        check('Revisar depois de 1, 7 e 30 dias')
      ])
    ],
    '#8b5cf6'
  )

  return {
    version: 1,
    workspaces: [welcome],
    libraries: [pentestLib, studyLib],
    templates: [
      {
        id: newId(),
        title: 'Relatório de vulnerabilidade',
        content:
          '<h2>Resumo</h2><p></p><h3>Severidade</h3><p>Crítica / Alta / Média / Baixa</p><h3>Descrição</h3><p></p><h3>Passos para reproduzir</h3><ol><li><p></p></li></ol><h3>Impacto</h3><p></p><h3>Correção recomendada</h3><p></p>'
      },
      {
        id: newId(),
        title: 'Resumo de estudo',
        content:
          '<h2>Tema</h2><p></p><h3>Ideias principais</h3><ul><li><p></p></li></ul><h3>Dúvidas</h3><ul><li><p></p></li></ul><h3>Próximos passos</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>'
      },
      {
        id: newId(),
        title: 'Ata de reunião',
        content:
          '<h2>Reunião</h2><p><strong>Data:</strong> </p><p><strong>Participantes:</strong> </p><h3>Pauta</h3><ul><li><p></p></li></ul><h3>Decisões</h3><ul><li><p></p></li></ul><h3>Ações</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p></p></li></ul>'
      }
    ],
    snippetGroups: [
      {
        id: newId(),
        title: 'Comandos úteis',
        items: [
          { id: newId(), title: 'Varredura de portas (nmap)', content: 'nmap -sC -sV -oA scan {{ip}}' },
          { id: newId(), title: 'Cabeçalhos do site (curl)', content: 'curl -I {{site}}' },
          { id: newId(), title: 'Servidor HTTP local', content: 'python -m http.server 8000' }
        ]
      }
    ],
    trash: [],
    settings: { theme: 'system' }
  }
}
