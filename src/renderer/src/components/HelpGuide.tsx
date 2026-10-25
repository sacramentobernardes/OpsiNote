import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  Sparkles,
  Waypoints,
  BookCopy,
  ClipboardList,
  Database,
  FileText,
  Layers,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  PenLine,
  Rocket,
  Search,
  Shuffle,
  Terminal,
  TextCursorInput,
  Trash2
} from 'lucide-react'
import { useBinding, useStore } from '../store'
import { comboHint } from '../lib/shortcuts'
import type { View } from '../types'
import { fold } from '../lib/text'
import { Keys, ShortcutKeys } from './Shortcuts'

interface HelpSection {
  id: string
  title: string
  icon: ReactNode
  body: ReactNode
}

/** Caixa de exemplo prático, passo a passo. */
function Example({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <div className="help-example">
      <span className="help-example-label">Exemplo prático</span>
      <strong className="help-example-title">{title}</strong>
      {children}
    </div>
  )
}

function Tip({ children }: { children: ReactNode }): ReactNode {
  return (
    <p className="help-tip">
      <Lightbulb size={15} />
      <span>{children}</span>
    </p>
  )
}

function Code({ children }: { children: string }): ReactNode {
  return <pre className="help-code">{children}</pre>
}

/** Botão que leva para a área do app de que a seção fala. */
function Go({ view, children }: { view: View; children: ReactNode }): ReactNode {
  const open = useStore((s) => s.open)
  return (
    <button type="button" className="btn small help-go" onClick={() => open(view)}>
      {children} <ArrowRight size={13} />
    </button>
  )
}

const SECTIONS: HelpSection[] = [
  {
    id: 'comecar',
    title: 'Primeiros passos',
    icon: <Rocket size={16} />,
    body: (
      <>
        <p>
          O OpsiNote organiza o que você está acompanhando em <strong>espaços</strong>. Um espaço pode ser um alvo de pentest, uma
          matéria, um projeto ou uma lista de tarefas. Dentro dele ficam <strong>seções</strong>, e cada seção tem um{' '}
          <strong>checklist</strong> e <strong>notas</strong>.
        </p>
        <ol className="help-steps">
          <li>
            No <strong>Início</strong>, clique numa categoria (Pentest, Estudo, Projeto, Tarefas ou Geral) para criar um espaço. Ou
            use <ShortcutKeys id="newWorkspace" />.
          </li>
          <li>Dê um nome ao espaço clicando no título.</li>
          <li>
            Preencha a <strong>ficha</strong> (primeira linha da árvore) com os dados principais.
          </li>
          <li>
            Crie seções com <em>+ Nova seção</em> e adicione itens ao checklist e notas.
          </li>
        </ol>
        <Example title="Começando um pentest em uma aplicação web">
          <ol className="help-steps">
            <li>
              Início → <strong>Pentest</strong>. Renomeie para <code>ACME – App Web</code>.
            </li>
            <li>
              Na <strong>Ficha do alvo</strong>, preencha <code>ip = 10.10.11.5</code> e <code>dominio = acme.htb</code>.
            </li>
            <li>
              Crie as seções <em>Recon</em>, <em>Enumeração web</em> e <em>Exploração</em>.
            </li>
            <li>
              Em <em>Recon</em>, adicione os itens <em>Scan de portas</em> e <em>Detectar serviços</em>. Marque cada um como
              concluído com <ShortcutKeys id="toggleDone" />.
            </li>
          </ol>
        </Example>
        <Go view={{ type: 'home' }}>Ir para o Início</Go>
      </>
    )
  },
  {
    id: 'espacos',
    title: 'Espaços, seções, checklist e notas',
    icon: <Layers size={16} />,
    body: (
      <>
        <ul>
          <li>
            <strong>Espaços</strong> aparecem como avatares no menu à esquerda. Arraste para reordenar. A porcentagem mostra quanto do
            checklist já foi concluído.
          </li>
          <li>
            <strong>Seções</strong> agrupam o trabalho (ex.: <em>Recon</em>, <em>Capítulo 3</em>, <em>Sprint 2</em>). Clique na seta
            para recolher; elas continuam recolhidas na próxima vez.
          </li>
          <li>
            <strong>Checklist</strong> é o que precisa ser feito. Cada item também tem uma página de texto para anotar detalhes.
          </li>
          <li>
            <strong>Notas</strong> são textos livres: achados, resumos, comandos que funcionaram, atas.
          </li>
        </ul>
        <p>
          Navegue pela árvore com <ShortcutKeys id="prevItem" /> e <ShortcutKeys id="nextItem" />. Itens e notas podem ser arrastados
          pela alça à esquerda para mudar a ordem.
        </p>
        <Tip>
          Trocar a categoria de um espaço não apaga nada: os campos da ficha da categoria anterior ficam guardados e voltam se você
          trocar de volta.
        </Tip>
      </>
    )
  },
  {
    id: 'ficha',
    title: 'Ficha e variáveis',
    icon: <ClipboardList size={16} />,
    body: (
      <>
        <p>
          A ficha é a primeira linha da árvore de cada espaço. Ela guarda as <strong>variáveis</strong> usadas pelos snippets, um
          período (início e fim) e campos que mudam conforme a categoria:
        </p>
        <table className="help-table">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Ficha</th>
              <th>Campos</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Pentest</td>
              <td>Ficha do alvo</td>
              <td>alvo, IP, domínio, URL; engajamento, escopo e contatos</td>
            </tr>
            <tr>
              <td>Estudo</td>
              <td>Ficha de estudo</td>
              <td>tema, curso; data da prova, objetivo, materiais e rotina</td>
            </tr>
            <tr>
              <td>Projeto</td>
              <td>Ficha do projeto</td>
              <td>repositório, URL; entrega, objetivo, links e pessoas</td>
            </tr>
            <tr>
              <td>Tarefas e Geral</td>
              <td>Ficha</td>
              <td>prazo e um campo de contexto</td>
            </tr>
          </tbody>
        </table>
        <p>
          Você pode criar suas próprias variáveis com <em>Adicionar variável</em>. O nome aceita letras, números, <code>_</code>,{' '}
          <code>.</code> e <code>-</code>, e maiúsculas e acentos não importam: <code>{'{{Domínio}}'}</code> e{' '}
          <code>{'{{dominio}}'}</code> são a mesma variável.
        </p>
        <Example title="Variáveis de um alvo">
          <Code>{`ip         = 10.10.11.5
dominio    = acme.htb
porta_web  = 8080
user       = svc_backup`}</Code>
          <p>
            Com isso, qualquer snippet que use <code>{'{{ip}}'}</code>, <code>{'{{dominio}}'}</code> ou{' '}
            <code>{'{{porta_web}}'}</code> sai preenchido para este alvo.
          </p>
        </Example>
        <p>
          Logo abaixo das variáveis, a seção <strong>Snippets</strong> mostra todos os seus snippets já preenchidos com os valores
          desta ficha: um clique copia. Quando falta uma variável, ela aparece como <code>{'{{wordlist}}'}</code>; clicar nela cria
          a variável na ficha e leva direto ao campo do valor.
        </p>
      </>
    )
  },
  {
    id: 'snippets',
    title: 'Snippets',
    icon: <Terminal size={16} />,
    body: (
      <>
        <p>
          Snippets são trechos de texto que você usa sempre: comandos, payloads, consultas, mensagens prontas. Ficam organizados em
          grupos e são copiados com um clique, já com as variáveis trocadas pelos valores da ficha.
        </p>
        <Example title="Snippet de scan com variáveis">
          <p>Crie um snippet com este conteúdo:</p>
          <Code>{'nmap -sC -sV -p- {{ip}} -oN nmap_{{dominio}}.txt'}</Code>
          <p>Com a ficha do exemplo anterior, ao copiar você recebe:</p>
          <Code>{'nmap -sC -sV -p- 10.10.11.5 -oN nmap_acme.htb.txt'}</Code>
        </Example>
        <ul>
          <li>
            Abaixo do editor, o painel <strong>Variáveis</strong> mostra cada variável, o valor encontrado e como o texto vai ficar.
          </li>
          <li>
            Em <em>Valores de</em>, escolha de qual espaço vêm os valores. Por padrão, é o último espaço aberto.
          </li>
          <li>
            Copie pelo botão <strong>Copiar</strong>, pelo ícone na lista ou com <ShortcutKeys id="copySnippet" />.
          </li>
          <li>
            Se faltar algum valor, o aviso diz quais variáveis ficaram sem preencher, e um botão leva direto para a ficha.
          </li>
        </ul>
        <Go view={{ type: 'snippets' }}>Ir para Snippets</Go>
      </>
    )
  },
  {
    id: 'snippets-texto',
    title: 'Variáveis e snippets dentro do texto',
    icon: <TextCursorInput size={16} />,
    body: (
      <>
        <p>Numa nota, num item do checklist, num modelo ou num campo da ficha, dois atalhos de texto inserem coisas prontas:</p>
        <ul>
          <li>
            <kbd>/</kbd> no começo de uma palavra mostra as <strong>variáveis da ficha</strong> do espaço aberto (ex.:{' '}
            <code>/ip</code>). A variável entra como uma etiqueta com o valor atual e <strong>acompanha a ficha</strong>: mudou o IP
            na ficha, mudou em todas as notas.
          </li>
          <li>
            <kbd>s/</kbd> no começo de uma palavra mostra os <strong>snippets</strong> (ex.: <code>s/nmap</code>). O snippet entra
            como bloco de código, já preenchido com os valores da ficha naquele momento.
          </li>
        </ul>
        <p>
          Continue digitando para filtrar; acentos e maiúsculas não importam. Use <Keys keys={['↑']} /> <Keys keys={['↓']} /> e{' '}
          <Keys keys={['Enter']} /> para inserir, ou <Keys keys={['Esc']} /> para fechar. Os botões <code>{'{ }'}</code> e de terminal
          na barra do editor abrem os mesmos menus com busca.
        </p>
        <Example title="Um checklist que se ajusta ao alvo">
          <p>Num item do checklist, escreva:</p>
          <Code>{'Testar login em /url com o usuário /user'}</Code>
          <p>
            Ao escolher cada variável, o texto mostra <code>https://acme.htb</code> e <code>svc_backup</code>. Crie o próximo espaço
            a partir da mesma biblioteca e o mesmo item mostra os valores do novo alvo.
          </p>
        </Example>
        <Tip>
          Nos modelos de nota e nas bibliotecas não há valores: a variável aparece como <code>{'{{ip}}'}</code> e ganha o valor
          quando a nota estiver num espaço com ficha. Nos campos da própria ficha, que são texto simples, <kbd>/</kbd> insere o
          valor como texto. Os menus não abrem em caminhos e endereços como <code>/usr/bin</code> ou <code>https://…</code>, nem
          dentro de blocos de código.
        </Tip>
      </>
    )
  },
  {
    id: 'editor',
    title: 'Escrevendo notas',
    icon: <PenLine size={16} />,
    body: (
      <>
        <p>
          O editor tem barra de formatação, mas muita coisa sai mais rápido digitando. Escreva no começo da linha:
        </p>
        <table className="help-table">
          <thead>
            <tr>
              <th>Digite</th>
              <th>Vira</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code># </code> <code>## </code> <code>### </code>
              </td>
              <td>Títulos de nível 1, 2 e 3</td>
            </tr>
            <tr>
              <td>
                <code>- </code> ou <code>* </code>
              </td>
              <td>Lista</td>
            </tr>
            <tr>
              <td>
                <code>1. </code>
              </td>
              <td>Lista numerada</td>
            </tr>
            <tr>
              <td>
                <code>[ ] </code>
              </td>
              <td>Lista de tarefas</td>
            </tr>
            <tr>
              <td>
                <code>&gt; </code>
              </td>
              <td>Citação</td>
            </tr>
            <tr>
              <td>
                <code>```</code>
              </td>
              <td>Bloco de código</td>
            </tr>
            <tr>
              <td>
                <code>---</code>
              </td>
              <td>Linha divisória</td>
            </tr>
          </tbody>
        </table>
        <p>
          No meio do texto: <code>**negrito**</code>, <code>*itálico*</code>, <code>`código`</code> e <code>~~tachado~~</code>.
        </p>
        <ul>
          <li>
            <strong>Imagens</strong>: cole uma captura de tela (<Keys keys={['Ctrl', 'V']} />) ou arraste um arquivo para a nota.
          </li>
          <li>
            <strong>Links</strong>: abra no navegador com <Keys keys={['Ctrl', 'clique']} />. Clique simples continua editando.
          </li>
          <li>
            <strong>Tabelas</strong>: pelo botão de tabela; com o cursor dentro, aparecem botões para adicionar linhas e colunas.
          </li>
          <li>
            Para sair de um bloco de código, pressione <Keys keys={['↓']} /> na última linha ou <Keys keys={['Enter']} /> três vezes.
          </li>
        </ul>
        <Tip>
          Ao colar conteúdo de um site, as imagens viram um link para o endereço delas. Assim, abrir a nota nunca avisa o site de
          origem de que você está lendo.
        </Tip>
      </>
    )
  },
  {
    id: 'modelos',
    title: 'Modelos de nota',
    icon: <FileText size={16} />,
    body: (
      <>
        <p>
          Modelos são estruturas prontas para notas que você escreve sempre do mesmo jeito: relatório de vulnerabilidade, resumo de
          aula, ata de reunião.
        </p>
        <Example title="Modelo de relatório de vulnerabilidade">
          <p>
            Em <strong>Modelos de nota</strong>, crie um modelo chamado <em>Vulnerabilidade</em> com:
          </p>
          <Code>{`## Resumo
## Severidade
## Alvo afetado
{{url}}
## Passos para reproduzir
1.
## Evidências
## Recomendação`}</Code>
          <p>
            Depois, em qualquer seção, use o seletor <strong>Modelo…</strong> ao lado de <em>+ Nova nota</em> para criar a nota já
            com essa estrutura.
          </p>
        </Example>
        <Go view={{ type: 'templates' }}>Ir para Modelos de nota</Go>
      </>
    )
  },
  {
    id: 'bibliotecas',
    title: 'Bibliotecas',
    icon: <BookCopy size={16} />,
    body: (
      <>
        <p>
          Bibliotecas são checklists reutilizáveis: a estrutura de seções, itens e notas, sem o progresso. Servem como roteiro para
          começar espaços novos sem montar tudo do zero.
        </p>
        <ul>
          <li>
            Num espaço, clique em <strong>Salvar como biblioteca</strong> para guardar a estrutura dele.
          </li>
          <li>
            No Início, em <em>Começar com uma biblioteca</em>, clique numa delas para criar um espaço igual, com o checklist zerado.
          </li>
          <li>As chaves da ficha também são copiadas, com os valores em branco.</li>
        </ul>
        <Example title="Roteiro padrão de pentest web">
          <p>
            Depois de terminar o primeiro alvo, salve o espaço como biblioteca <em>Pentest Web</em>. No próximo alvo, crie o espaço a
            partir dela: todas as seções e itens já estão lá, desmarcados, e a ficha já tem <code>ip</code>, <code>dominio</code> e{' '}
            <code>url</code> esperando valores.
          </p>
        </Example>
        <Go view={{ type: 'libraries' }}>Ir para Bibliotecas</Go>
      </>
    )
  },
  {
    id: 'busca',
    title: 'Busca e comandos',
    icon: <Search size={16} />,
    body: (
      <>
        <p>
          <ShortcutKeys id="palette" /> abre a busca de qualquer lugar. Ela procura em títulos e no conteúdo de espaços, fichas,
          seções, itens, notas, modelos e snippets, sem ligar para acentos.
        </p>
        <p>
          A mesma janela executa comandos: digite <code>tema</code>, <code>exportar</code>, <code>lixeira</code> ou{' '}
          <code>foco</code> para ver as ações disponíveis.
        </p>
        <Example title="Achando aquela credencial">
          <p>
            Pressione <ShortcutKeys id="palette" /> e digite <code>svc_backup</code>. A busca mostra a ficha e as notas onde o
            usuário aparece, com o trecho destacado. <Keys keys={['Enter']} /> abre o resultado.
          </p>
        </Example>
      </>
    )
  },
  {
    id: 'fixados-grafo',
    title: 'Fixados, grafo, temporizador e aparência',
    icon: <Waypoints size={16} />,
    body: (
      <>
        <ul>
          <li>
            <strong>Fixar no topo</strong>: pelo menu <strong>⋯</strong> de um item, nota ou snippet, ou pelo botão direito num
            espaço. O que está fixado aparece primeiro nas listas, no trilho e na seção <strong>Fixados</strong> do Início (e na
            busca, antes de digitar).
          </li>
          <li>
            <strong>Grafo</strong> (ícone no trilho): mostra os espaços, tarefas e notas e como se ligam. Um texto se liga a outro
            quando cita o título dele, solto ou como <code>[[Título]]</code>. Clique num nó para abrir, arraste para mover, role
            para dar zoom. O painel ao lado lista os <strong>mais conectados</strong> e as tarefas e notas{' '}
            <strong>sem nenhuma conexão</strong>.
            <ul>
              <li>
                <strong>Ligar pelo grafo</strong>: <Keys keys={['Shift']} /> + arraste de uma nota ou tarefa até outro nó. A nota
                ganha <code>[[Título]]</code> no texto (o aviso tem Desfazer).
              </li>
              <li>
                <strong>Botão direito num nó</strong>: abrir, ver só a vizinhança (1 a 3 passos), ligar a outro nó, copiar{' '}
                <code>[[Título]]</code> e fixar no topo.
              </li>
              <li>
                Também dá para colorir por espaço, tipo ou categoria, ocultar as tarefas concluídas e salvar o grafo como imagem
                (PNG). Filtros e cores ficam lembrados.
              </li>
            </ul>
          </li>
          <li>
            <strong>Temporizador de foco</strong>: o botão de relógio na barra do documento começa uma sessão (15, 25, 50 ou 90
            minutos) e entra no modo foco. O contador fica no canto da tela, com pausar e parar; no fim, o app avisa e sugere uma
            pausa.
          </li>
          <li>
            <strong>Aparência</strong>: em Configurações → Geral, escolha a cor de destaque, a densidade (compacta mostra mais
            itens), o jeito dos cartões e os cantos.
          </li>
        </ul>
        <Example title="Ligando o pentest ao relatório">
          <p>
            Numa nota do espaço <em>Projeto Atlas</em>, escreva <code>Ver [[Portas abertas]]</code>. No grafo, a nota passa a ter
            uma linha até a nota <em>Portas abertas</em> do pentest, e as duas saem da lista de sem conexões.
          </p>
        </Example>
        <Go view={{ type: 'graph' }}>Abrir o grafo</Go>
      </>
    )
  },
  {
    id: 'organizar',
    title: 'Organizar: mover, duplicar, cores e foco',
    icon: <Shuffle size={16} />,
    body: (
      <ul>
        <li>
          O menu <strong>⋯</strong> de cada linha permite duplicar, mover e excluir itens, notas, seções, snippets, modelos e espaços.
        </li>
        <li>
          <ShortcutKeys id="duplicate" /> duplica o que está aberto.
        </li>
        <li>Espaços, itens e notas podem ter uma cor, escolhida no seletor de cor do cabeçalho do espaço ou do documento aberto.</li>
        <li>
          <strong>Modo foco</strong> (<ShortcutKeys id="focus" />) esconde tudo menos o documento. <Keys keys={['Esc']} />{' '}
          sai.
        </li>
        <li>Arraste as bordas do menu e do painel para ajustar as larguras.</li>
        <li>
          <strong>Botão direito</strong> num espaço (no trilho e no Início) ou numa biblioteca abre as ações dele: abrir, renomear,
          mudar a cor e a categoria, duplicar, salvar como biblioteca (ou criar um espaço a partir dela), exportar só ele e excluir.
          Pelo teclado, use a tecla de menu ou <Keys keys={['Shift', 'F10']} />.
        </li>
        <li>
          Os atalhos de teclado podem ser trocados em Configurações → <strong>Atalhos</strong>: clique no atalho e pressione a nova
          combinação. O app não deixa duas ações com a mesma combinação nem usar teclas do editor, como Ctrl+C.
        </li>
      </ul>
    )
  },
  {
    id: 'lixeira',
    title: 'Lixeira e desfazer',
    icon: <Trash2 size={16} />,
    body: (
      <>
        <p>
          Nada é apagado de imediato. Logo depois de excluir, o aviso na parte de baixo tem um botão <strong>Desfazer</strong>. Depois
          disso, o item fica na <strong>Lixeira</strong> por 30 dias e pode ser restaurado no mesmo lugar, mesmo que o espaço de
          origem também tenha sido excluído.
        </p>
        <Go view={{ type: 'trash' }}>Abrir a lixeira</Go>
      </>
    )
  },
  {
    id: 'dados',
    title: 'Dados e backup',
    icon: <Database size={16} />,
    body: (
      <>
        <p>
          Tudo é salvo sozinho em <code>%APPDATA%\OpsiNote\opsinote-data.json</code>, com uma cópia <code>.bak</code> da versão
          anterior. As imagens ficam na pasta <code>attachments</code> ao lado.
        </p>
        <ul>
          <li>
            <strong>Exportar</strong> deixa escolher o formato e o que entra no arquivo (espaços, bibliotecas, modelos e grupos de
            snippets) e, se quiser, zerar os checklists para compartilhar um roteiro sem o seu progresso. Os formatos:
            <ul>
              <li>
                <strong>Backup do OpsiNote</strong> (.json): completo, para levar a outro computador.
              </li>
              <li>
                <strong>Página HTML</strong>: para ler no navegador ou imprimir em PDF. Também volta para o app sem perdas.
              </li>
              <li>
                <strong>Markdown</strong> (.md): para Obsidian, Notion ou GitHub.
              </li>
              <li>
                <strong>Planilha CSV</strong>: uma linha por item, para Excel ou Google Planilhas.
              </li>
              <li>
                <strong>Texto simples</strong> (.txt): sem formatação, para colar em qualquer lugar.
              </li>
            </ul>
          </li>
          <li>
            <strong>Importar</strong> aceita todos esses formatos, um ou vários arquivos de uma vez, e acrescenta o conteúdo ao que já
            existe. Arquivos de outros apps também entram: no Markdown, <code>#</code> vira espaço, <code>##</code> seção,{' '}
            <code>###</code> nota e <code>- [ ]</code> item do checklist; numa planilha, cada linha vira um item.
          </li>
          <li>Se uma gravação falhar, um aviso fica no topo e o app tenta de novo sozinho.</li>
        </ul>
        <Example title="Compartilhando seu roteiro com a equipe">
          <p>
            Configurações → Dados e backup → <strong>Exportar…</strong>. Marque só a biblioteca <em>Pentest Web</em> e o grupo de
            snippets <em>Recon</em>, ative a opção de zerar os checklists e salve. Quem importar recebe o roteiro e os comandos, sem
            os seus dados de alvos.
          </p>
        </Example>
        <Go view={{ type: 'settings', tab: 'data' }}>Abrir Dados e backup</Go>
      </>
    )
  },
  {
    id: 'receitas',
    title: 'Receitas para outros usos',
    icon: <ListChecks size={16} />,
    body: (
      <>
        <Example title="Estudando para uma prova">
          <ol className="help-steps">
            <li>
              Crie um espaço <strong>Estudo</strong> chamado <em>Cálculo II</em> e ponha a data da prova na ficha.
            </li>
            <li>Uma seção por capítulo; no checklist, os tópicos e listas de exercícios.</li>
            <li>
              Crie o modelo <em>Resumo de aula</em> (<em>Conceitos</em>, <em>Fórmulas</em>, <em>Dúvidas</em>) e use-o em cada nota.
            </li>
            <li>A porcentagem no menu mostra quanto do conteúdo já foi visto.</li>
          </ol>
        </Example>
        <Example title="Acompanhando um projeto de software">
          <ol className="help-steps">
            <li>
              Crie um espaço <strong>Projeto</strong>; na ficha, preencha <code>repositorio</code> e <code>url</code>.
            </li>
            <li>
              Snippets como <code>{'git clone {{repositorio}}'}</code> e <code>{'curl -I {{url}}/health'}</code> saem prontos.
            </li>
            <li>Uma seção por entrega, com as tarefas no checklist e as atas de reunião nas notas.</li>
          </ol>
        </Example>
      </>
    )
  },
  {
    id: 'faq',
    title: 'Perguntas frequentes',
    icon: <MessageCircleQuestion size={16} />,
    body: (
      <dl className="help-faq">
        <dt>Meus dados vão para a internet?</dt>
        <dd>Não. Tudo fica no seu computador. O app só acessa a internet para procurar atualizações, se estiverem configuradas.</dd>
        <dt>Abri o app duas vezes. Vou perder alguma coisa?</dt>
        <dd>Não. O OpsiNote abre uma janela só: abrir de novo traz a janela existente para a frente.</dd>
        <dt>Uma variável aparece como {'{{ip}}'} em vez do valor.</dt>
        <dd>
          A ficha do espaço de onde vêm os valores não tem essa variável preenchida. Confira o nome (sem espaços) e qual espaço está
          em <em>Valores de</em>, na tela de Snippets.
        </dd>
        <dt>Como passo meus dados para outro computador?</dt>
        <dd>
          Exporte um backup com tudo marcado e importe no outro computador. As imagens vão embutidas no arquivo.
        </dd>
        <dt>Excluí algo sem querer.</dt>
        <dd>Clique em Desfazer no aviso, ou restaure pela Lixeira em até 30 dias.</dd>
      </dl>
    )
  }
]

/** Guia de uso com exemplos práticos, índice e busca. */
export function HelpGuide(): ReactNode {
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState<Set<string> | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const helpKeys = useBinding('help')
  const addWelcome = useStore((s) => s.addWelcome)

  // Filtra pelo texto já renderizado de cada seção (as escondidas continuam no DOM).
  useLayoutEffect(() => {
    const q = fold(query.trim())
    if (!q) return setVisible(null)
    const words = q.split(/\s+/)
    const ids = new Set<string>()
    body.current?.querySelectorAll<HTMLElement>('[data-help]').forEach((el) => {
      const text = fold(el.textContent ?? '')
      if (words.every((w) => text.includes(w))) ids.add(el.dataset.help!)
    })
    setVisible(ids)
  }, [query])

  const shown = (id: string): boolean => !visible || visible.has(id)
  const jump = (id: string): void =>
    document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="help">
      <header className="settings-head">
        <h2>Ajuda</h2>
        <p className="muted">
          Como usar o OpsiNote, com exemplos práticos.{helpKeys && ` Abra esta página de qualquer lugar com ${comboHint(helpKeys)}.`}
        </p>
        <div className="settings-actions">
          <button type="button" className="btn small" onClick={addWelcome}>
            <Sparkles size={14} /> Fazer o tour de boas-vindas
          </button>
          <span className="muted small">Cria um espaço com um passo a passo para experimentar cada recurso.</span>
        </div>
      </header>
      <label className="search help-search">
        <Search size={14} />
        <input placeholder="Buscar na ajuda (ex.: variável, backup, imagem)" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      <nav className="help-toc" aria-label="Tópicos da ajuda">
        {SECTIONS.filter((s) => shown(s.id)).map((s) => (
          <button key={s.id} type="button" className="chip small" onClick={() => jump(s.id)}>
            {s.icon} {s.title}
          </button>
        ))}
      </nav>

      <div ref={body}>
        {SECTIONS.map((s) => (
          <section key={s.id} id={`help-${s.id}`} data-help={s.id} className="help-section" hidden={!shown(s.id)}>
            <h3>
              <span className="help-section-icon">{s.icon}</span>
              {s.title}
            </h3>
            {s.body}
          </section>
        ))}
        {visible && visible.size === 0 && <p className="help-empty">Nada encontrado para “{query}”.</p>}
      </div>
    </div>
  )
}
