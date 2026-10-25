import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, htmlToPlainText, parseHtml, sanitizeHtml, serializeHtml } from './html'
import { inline, markdownToHtml } from './markdown'

describe('parseHtml', () => {
  it('lê HTML malformado como o navegador', () => {
    expect(serializeHtml(parseHtml('<ul><li>a<li>b</ul><p>x<p>y'))).toBe('<ul><li>a</li><li>b</li></ul><p>x</p><p>y</p>')
    expect(serializeHtml(parseHtml('a < b &amp; c'))).toBe('a &lt; b &amp; c')
    expect(serializeHtml(parseHtml('<img src="x.png"><br/>fim'))).toBe('<img src="x.png"><br>fim')
  })
})

describe('sanitizeHtml', () => {
  it('tira scripts, eventos e links perigosos', () => {
    const dirty = '<p onclick="alert(1)">oi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a><iframe src="//e"></iframe><style>p{}</style>'
    expect(sanitizeHtml(dirty)).toBe('<p>oi</p><a>x</a>')
  })

  it('mantém o que o editor usa e troca imagens da internet por link', () => {
    const html = '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked=""></label><div><p>ok</p></div></li></ul>'
    expect(sanitizeHtml(html)).toBe(html)
    expect(sanitizeHtml('<img src="https://e.com/a.png">')).toContain('[imagem externa] https://e.com/a.png')
    expect(sanitizeHtml('<img src="data:image/svg+xml;base64,AAAA">')).toBe('')
    expect(sanitizeHtml('<font color="red"><b>x</b></font>')).toBe('<b>x</b>')
  })
})

describe('htmlToMarkdown', () => {
  it('converte o HTML do editor', () => {
    const html =
      '<h2>Resumo</h2><p>Porta <strong>8080</strong> com <em>Jenkins</em> e <code>id</code></p>' +
      '<ul><li><p>um</p><ul><li><p>sub</p></li></ul></li><li><p>dois</p></li></ul>' +
      '<ol start="3"><li><p>três</p></li></ol>' +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox"></label><div><p>feito</p></div></li><li data-type="taskItem" data-checked="false"><div><p>falta</p></div></li></ul>' +
      '<pre><code class="language-bash">nmap -sV 10.0.0.1\n</code></pre>' +
      '<blockquote><p>citação</p></blockquote><p><a href="https://x.com/a(b)">link</a></p>'
    expect(htmlToMarkdown(html)).toBe(
      [
        '## Resumo',
        'Porta **8080** com *Jenkins* e `id`',
        '- um\n  - sub\n- dois',
        '3. três',
        '- [x] feito\n- [ ] falta',
        '```bash\nnmap -sV 10.0.0.1\n```',
        '> citação',
        '[link](https://x.com/a%28b%29)'
      ].join('\n\n')
    )
  })

  it('desce os títulos quando pedido e escapa só o necessário', () => {
    expect(htmlToMarkdown('<h1>A</h1><h3>B</h3><h4>C</h4>', { headingOffset: 3 })).toBe('#### A\n\n###### B\n\n**C**')
    expect(htmlToMarkdown('<p>svc_backup *não* é _ênfase_</p>')).toBe('svc_backup \\*não\\* é \\_ênfase\\_')
    expect(htmlToMarkdown('<p># não é título</p><p>1. nem lista</p>')).toBe('\\# não é título\n\n1\\. nem lista')
  })

  it('converte tabelas e, em texto simples, tira as marcações', () => {
    const table = '<table><tbody><tr><th><p>Porta</p></th><th><p>Serviço</p></th></tr><tr><td><p>22</p></td><td><p>ssh</p></td></tr></tbody></table>'
    expect(htmlToMarkdown(table)).toBe('| Porta | Serviço |\n| --- | --- |\n| 22 | ssh |')
    expect(htmlToPlainText('<p>a <strong>b</strong> <a href="https://x.com">site</a></p><p>c<br>d</p>')).toBe('a b site (https://x.com)\n\nc\nd')
    expect(htmlToMarkdown('<p><img src="data:image/png;base64,AA" alt="print"></p>', { images: false })).toBe('[imagem: print]')
  })
})

describe('markdownToHtml', () => {
  it('converte blocos no formato do editor', () => {
    expect(markdownToHtml('# T\n\ntexto\nlinha 2\n\n- [x] a\n- [ ] b\n\n1. um\n2. dois')).toBe(
      '<h1>T</h1><p>texto<br>linha 2</p>' +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>a</p></li><li data-type="taskItem" data-checked="false"><p>b</p></li></ul>' +
        '<ol><li><p>um</p></li><li><p>dois</p></li></ol>'
    )
    expect(markdownToHtml('```sh\necho <b>\n```')).toBe('<pre><code class="language-sh">echo &lt;b&gt;</code></pre>')
    expect(markdownToHtml('- a\n  - b\n- c')).toBe('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li><li><p>c</p></li></ul>')
    expect(markdownToHtml('| A | B |\n|---|---|\n| 1 | 2 |')).toBe(
      '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></tbody></table>'
    )
    expect(markdownToHtml('#### Sub', { promote: 3 })).toBe('<h1>Sub</h1>')
  })

  it('formata o texto sem deixar HTML passar', () => {
    expect(inline('**b** *i* ~~s~~ `c<d>` [l](https://x.com) svc_backup')).toBe(
      '<strong>b</strong> <em>i</em> <s>s</s> <code>c&lt;d&gt;</code> <a href="https://x.com">l</a> svc_backup'
    )
    expect(inline('<script>alert(1)</script> [x](javascript:void)')).toBe('&lt;script&gt;alert(1)&lt;/script&gt; x')
    expect(inline('\\*literal\\* <u>sub</u>')).toBe('*literal* <u>sub</u>')
  })

  it('volta igual ao que htmlToMarkdown gerou', () => {
    const html = '<h2>Achados</h2><p>Porta <strong>8080</strong> e <code>svc_backup</code></p><ul><li><p>um</p></li><li><p>dois</p></li></ul>'
    expect(markdownToHtml(htmlToMarkdown(html))).toBe(html)
  })
})

describe('variáveis da ficha no texto', () => {
  const note = '<p>Alvo <span data-var="ip" class="sheet-var">{{ip}}</span> na porta 80</p>'

  it('a limpeza mantém a chave e recusa chaves estranhas', () => {
    expect(sanitizeHtml(note)).toBe('<p>Alvo <span data-var="ip">{{ip}}</span> na porta 80</p>')
    expect(sanitizeHtml('<span data-var="x&quot; onclick=&quot;y">a</span>')).toBe('<span>a</span>')
  })

  it('sai como {{chave}} no Markdown e volta como variável', () => {
    const md = htmlToMarkdown(note)
    expect(md).toBe('Alvo {{ip}} na porta 80')
    expect(markdownToHtml(md)).toBe('<p>Alvo <span data-var="ip">{{ip}}</span> na porta 80</p>')
  })

  it('dentro de código continua texto', () => {
    expect(markdownToHtml('`curl {{url}}`')).toBe('<p><code>curl {{url}}</code></p>')
    expect(markdownToHtml('```\ncurl {{url}}\n```')).toBe('<pre><code>curl {{url}}</code></pre>')
  })
})
