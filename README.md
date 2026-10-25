# OpsiNote

Aplicativo desktop para organizar notas, checklists e acompanhamento de alvos de pentest, estudos, projetos e tarefas.

## Conceitos

- **Espaços**: o que você está acompanhando (um alvo, uma matéria, um projeto, uma lista de tarefas). Cada espaço tem seções, e cada seção tem um checklist e notas.
- **Bibliotecas**: checklists reutilizáveis. Crie um espaço a partir de uma biblioteca, ou salve um espaço como biblioteca.
- **Modelos de nota**: estruturas prontas para novas notas (relatório de vulnerabilidade, resumo de estudo, ata).
- **Snippets**: trechos de texto copiados com um clique. Podem ter variáveis, como `nmap -sV {{ip}}`, preenchidas ao copiar.
  Também podem ser inseridos no texto: digite `s/` numa nota, item, modelo ou campo da ficha (ou use o botão de terminal) e escolha o snippet. Nas notas ele entra como bloco de código, com as variáveis já preenchidas pela ficha do espaço; nos modelos e nas bibliotecas as `{{variáveis}}` ficam como estão.
- **Variáveis no texto**: digite `/` numa nota ou item (ou use o botão `{ }`) e escolha uma variável da ficha do espaço aberto. Ela aparece como uma etiqueta com o valor atual e acompanha a ficha: mudou o valor lá, muda em todas as notas. Nos modelos e bibliotecas aparece como `{{chave}}` e ganha o valor quando a nota estiver num espaço. Na exportação sai como `{{chave}}` (a ficha vai junto), e um Markdown importado com `{{chave}}` fora de código volta como variável.
- **Ficha**: primeira linha da árvore de cada espaço, com campos conforme a categoria. Todas guardam as variáveis usadas nos snippets e um período. A seção **Snippets** da ficha lista todos os snippets já preenchidos com as variáveis dela, para copiar com um clique; uma variável que falta pode ser criada ali mesmo.
  - *Pentest* → **Ficha do alvo**: alvo, IP, domínio, URL; engajamento, escopo e contatos.
  - *Estudo* → **Ficha de estudo**: tema, curso; data da prova/meta, objetivo, materiais e rotina.
  - *Projeto* → **Ficha do projeto**: repositório, URL; entrega, objetivo, links e pessoas.
  - *Tarefas* e *Geral*: prazo e um campo de contexto/anotações.

  Ao trocar a categoria, os campos da anterior ficam guardados e voltam se você trocar de volta.
- **Configurações** (engrenagem no trilho): tema, menu lateral, espaço usado pelos snippets, dados e backup, atalhos (personalizáveis), **Ajuda** com exemplos práticos de uso, e a versão do app.
- **Lixeira**: o que você exclui vai para a lixeira, de onde pode ser restaurado por 30 dias. Logo depois de excluir, o aviso tem um botão **Desfazer**.

Itens, notas, seções, snippets, modelos e espaços podem ser duplicados e movidos pelo menu **⋯** de cada linha. Clicar com o **botão direito** num espaço (no trilho ou no Início) ou numa biblioteca abre as ações dele: abrir, renomear, mudar a cor e a categoria, duplicar, salvar como biblioteca ou criar um espaço a partir dela, exportar só ele e excluir (pelo teclado: tecla de menu ou `Shift+F10`).

- **Fixados**: espaços, itens, notas e snippets podem ser fixados no topo (menu **⋯** ou botão direito → **Fixar no topo**). Eles aparecem primeiro nas listas e no trilho, na seção **Fixados** do Início e na busca antes de digitar. A ordem guardada não muda: desafixar devolve o item ao lugar.
- **Grafo** (ícone no trilho): mostra como espaços, tarefas, notas e, se quiser, bibliotecas e snippets se ligam. Cada espaço se liga às próprias tarefas e notas, e um texto se liga a outro quando cita o título dele (solto ou como `[[Título]]`, sem ligar para acentos). Títulos repetidos, curtos (menos de 4 letras) ou genéricos ("Novo espaço") não geram ligação. Clique num nó para abrir o conteúdo, arraste para mover, role para dar zoom. O painel ao lado lista os **mais conectados** e as tarefas e notas **sem nenhuma conexão** (e pode destacá-las no grafo).
  - **Ligar pelo grafo**: `Shift` + arraste de uma nota ou tarefa até outro nó, ou botão direito → **Ligar a outro nó…**. A nota ganha `[[Título]]` no fim do texto; o aviso tem **Desfazer**. Só notas e tarefas recebem a menção, e o app explica quando não dá (título repetido, curto ou genérico, ou já ligados).
  - **Botão direito num nó**: abrir, **ver só a vizinhança** (o nó e os vizinhos a 1, 2 ou 3 passos), ligar, copiar `[[Título]]` e fixar no topo. Pelo teclado: Tab até o nó e tecla de menu ou `Shift+F10`.
  - **Cores por** espaço, tipo ou categoria; **Ocultar concluídas**; **Salvar imagem** grava o grafo como PNG. Filtros e cores ficam lembrados neste computador.
- **Temporizador de foco**: o botão de relógio na barra do documento começa uma sessão de 15, 25, 50 ou 90 minutos e entra no modo foco, ou uma pausa de 5 ou 15. O contador fica no canto da tela com pausar e parar; no fim, toca um aviso curto, aparece uma notificação do sistema e o app sugere o próximo passo. As sessões do dia são contadas. Também na busca (`Ctrl+K`): "Iniciar foco de 25 minutos".
- **Aparência** (Configurações → Geral): cor de destaque (prontas ou qualquer outra), densidade confortável ou compacta, cartões com borda, com sombra ou planos, e cantos suaves, retos ou arredondados. Vale nos temas claro e escuro e vai junto no backup.

Na primeira abertura, o espaço **Bem-vindo ao OpsiNote** é um tour para fazer usando o próprio app: tem uma ficha com variáveis de exemplo, um item que mostra uma variável ao vivo e passos para cada recurso. Para refazê-lo, use **Fazer o tour de boas-vindas** na Ajuda ou o comando na busca (`Ctrl+K`). Os espaços do trilho são reordenados arrastando, e as seções recolhidas continuam recolhidas na próxima vez.

## Atalhos de teclado

| Atalho | O que faz |
| --- | --- |
| `Ctrl+K` | Busca em tudo (títulos e conteúdo) e executa comandos |
| `Ctrl+/` | Lista todos os atalhos |
| `Ctrl+,` | Abre as configurações |
| `F1` | Abre a ajuda (guia de uso com exemplos práticos) |
| `Ctrl+Shift+N` | Novo espaço |
| `Ctrl+\` | Expande ou recolhe o menu |
| `Ctrl+Shift+F` | Modo foco (só o documento); `Esc` sai |
| `Alt+↑` / `Alt+↓` | Item anterior / próximo da árvore |
| `Ctrl+Enter` | Marca o item aberto como concluído ou pendente |
| `Ctrl+Shift+D` | Duplica o item, nota, snippet ou modelo aberto |
| `Ctrl+Shift+C` | Copia o snippet aberto com as variáveis preenchidas |

Esses são os padrões. Em **Configurações → Atalhos**, clique num atalho e pressione a nova combinação (`Esc` cancela); cada um também pode ser removido ou voltar ao padrão. O app recusa, explicando o motivo:

- uma combinação que já é de outra ação (duas ações nunca ficam com o mesmo atalho);
- teclas sem `Ctrl` ou `Alt`, que atrapalhariam a digitação (as teclas `F1`–`F12` podem ser usadas sozinhas);
- atalhos do editor e do sistema, como `Ctrl+C`, `Ctrl+V`, `Ctrl+Z`, `Ctrl+B` ou `Alt+F4`, e `Ctrl` com setas, `Home`, `End`, `Backspace` ou `Delete`;
- `Ctrl+Alt` com letras, números ou símbolos, que no Windows é o `AltGr` (usado para digitar `@`, `€`, `/`…).

Os atalhos personalizados ficam salvos junto com os dados. `Esc` para sair do modo foco é fixo.

## Rodar localmente

Requer Node.js 20 ou mais recente.

```bash
npm install
npm run dev
```

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run build` | Gera a versão de produção em `out/` |
| `npm run preview` | Abre a versão de produção |
| `npm run typecheck` | Verifica os tipos do TypeScript |
| `npm test` | Roda os testes automatizados (`npm run test:watch` para rodar a cada alteração) |
| `npm run package:win` | Gera o instalador para Windows em `release/` |

## Dados

Tudo é salvo automaticamente em `opsinote-data.json`, na pasta de dados do usuário (no Windows, `%APPDATA%\OpsiNote`). Uma cópia `.bak` da versão anterior é mantida a cada gravação. Use o menu **Dados** (ícone de banco de dados no trilho à esquerda) para exportar. A exportação permite escolher o que entra no arquivo (espaços, bibliotecas, modelos e grupos de snippets, um a um) e, se quiser, zerar os checklists para compartilhar um roteiro sem o seu progresso. Formatos:

| Formato | Para quê | Ao importar de volta |
| --- | --- | --- |
| Backup do OpsiNote (`.json`) | Levar tudo para outro computador | Sem perdas |
| Página HTML (`.html`) | Ler no navegador ou imprimir em PDF | Sem perdas (os dados vão embutidos na página) |
| Markdown (`.md`) | Obsidian, Notion, GitHub, qualquer editor | Mantém estrutura, ficha, cores e formatação |
| Planilha CSV (`.csv`) | Excel ou Google Planilhas, uma linha por item | Mantém itens, conclusão e variáveis; sem imagens |
| Texto simples (`.txt`) | Colar em qualquer lugar | Mantém a estrutura; sem formatação nem imagens |

O CSV usa `;` como separador e é salvo em UTF-8 com BOM, que é o que o Excel em português abre direto. Células que começam com `=`, `+`, `-` ou `@` ganham um `'` na frente, para o Excel não executá-las como fórmula (um payload nas notas não vira ataque a quem abre a planilha); a importação tira o `'` de volta.

**Importar** aceita todos esses formatos, um ou vários arquivos de uma vez, e acrescenta o conteúdo ao que já existe. Arquivos de outros apps também entram:

- **Markdown**: `#` vira espaço, `##` seção, `###` nota e `- [ ]` / `- [x]` itens do checklist. Um arquivo sem títulos vira uma nota com o nome do arquivo.
- **HTML**: uma página qualquer vira uma nota, sem scripts, estilos nem eventos.
- **CSV**: cada linha vira um item do checklist, com as outras colunas no conteúdo. Uma coluna como *Status* ou *Concluído* marca o item.
- **Texto**: linhas `[ ]` / `[x]` viram itens do checklist e o resto, uma nota.

O app abre uma janela só: abrir de novo traz a janela existente para a frente, para duas cópias nunca gravarem por cima uma da outra. Se uma gravação falhar (disco cheio, arquivo bloqueado ou somente leitura), um aviso fica no topo da tela e o app tenta de novo sozinho; ao fechar com alterações não salvas, ele pergunta antes. Se o arquivo de dados for de uma versão mais nova ou estiver em formato desconhecido, o app mostra o erro e não altera nada.

As imagens coladas nas notas ficam em `%APPDATA%\OpsiNote\attachments`, uma vez só por imagem, e o JSON guarda apenas o endereço delas. Isso mantém o salvamento rápido mesmo com muitas capturas de tela. Ao exportar, as imagens vão embutidas no arquivo, para o backup funcionar em outro computador. Dados antigos com imagens embutidas são convertidos sozinhos na primeira abertura, e imagens que nada mais usa são apagadas depois de um dia.

O app nunca busca imagens na internet: ao colar conteúdo de um site, as imagens remotas viram um link para o endereço delas (`[imagem externa] https://…`). Assim, abrir uma nota não revela seu IP nem o horário de leitura ao site de origem.

Links nas notas abrem no navegador com `Ctrl+clique`.

## Atualizações e assinatura

O app instalado procura atualizações sozinho, mas só depois que um local de publicação for configurado:

1. No `electron-builder.yml`, descomente o bloco `publish` e preencha o usuário e o repositório do GitHub.
2. Gere um token do GitHub com permissão de escrita em Releases e defina a variável de ambiente `GH_TOKEN`.
3. Aumente a versão no `package.json` e rode `npx electron-builder --win --publish always`.

Quando uma versão nova termina de baixar, o app mostra **Reiniciar e atualizar**. Se você não reiniciar, ela é instalada ao fechar o app.

### Ícone

O desenho original é `build/icon.svg`. Dele saem `build/icon.png` (512 px, para Linux e macOS) e `build/icon.ico` (Windows, com cada tamanho de 16 a 256 px desenhado do SVG, e não reduzido, para ficar nítido na barra de tarefas). Se mudar o SVG, gere os dois de novo.

No Windows, o ícone da barra de tarefas vem da identidade do app (AppUserModelID), não da janela, e o Windows guarda esse ícone em cache por id. Por isso o app instalado usa `app.opsinote.notes` (o `appId` do `electron-builder.yml`) e o de desenvolvimento usa `app.opsinote.notes.dev`: se os dois dividissem o id, o ícone do `electron.exe` (o átomo do Electron) ficaria preso ao app instalado.

Para o Windows não mostrar o aviso do SmartScreen, o instalador precisa ser assinado com um certificado de assinatura de código. Com o certificado em mãos, defina `CSC_LINK` (caminho do `.pfx`) e `CSC_KEY_PASSWORD` antes de gerar o instalador; o electron-builder assina sozinho.

## Estrutura

```
src/
  main/       processo principal do Electron (janela, arquivos, imagens, atualização)
  preload/    ponte segura entre a janela e o processo principal
  renderer/   interface em React
    src/components/   telas e componentes
    src/lib/          lógica sem interface: lixeira, mover/duplicar, busca, variáveis, atalhos,
                      importação e exportação nos vários formatos, HTML ↔ Markdown
                      (cada uma com seu arquivo .test.ts)
    src/store.ts      estado do app (Zustand)
```

## Licença

GPL-3.0. Este projeto é derivado de um trabalho de código aberto distribuído sob a GNU General Public License v3.0.
