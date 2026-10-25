import { describe, expect, it } from 'vitest'
import type { SnippetGroup } from '../types'
import { matchSnippets, sheetSnippets, slashTrigger, snippetText } from './snippets'

describe('slashTrigger', () => {
  it('"/" no começo de uma palavra chama as variáveis', () => {
    expect(slashTrigger('/')).toEqual({ kind: 'variable', query: '', length: 1 })
    expect(slashTrigger('IP do alvo: /i')).toEqual({ kind: 'variable', query: 'i', length: 2 })
  })

  it('"s/" no começo de uma palavra chama os snippets', () => {
    expect(slashTrigger('s/')).toEqual({ kind: 'snippet', query: '', length: 2 })
    expect(slashTrigger('Rodei o scan: s/nmap')).toEqual({ kind: 'snippet', query: 'nmap', length: 6 })
    expect(slashTrigger('S/nm')).toEqual({ kind: 'snippet', query: 'nm', length: 4 })
  })

  it('ignora "/" no meio de palavras, caminhos, links e depois de espaço digitado', () => {
    expect(slashTrigger('http://site')).toBeNull()
    expect(slashTrigger('a/b')).toBeNull()
    expect(slashTrigger('tests/')).toBeNull()
    expect(slashTrigger('/usr/bin')).toBeNull()
    expect(slashTrigger('/ip ')).toBeNull()
    expect(slashTrigger('s/ juros')).toBeNull()
    expect(slashTrigger('texto')).toBeNull()
  })
})

describe('matchSnippets', () => {
  const groups: SnippetGroup[] = [
    {
      id: 'g1',
      title: 'Reconhecimento',
      items: [
        { id: 'a', title: 'Scan completo', content: 'nmap -p- {{ip}}' },
        { id: 'b', title: 'Nmap versões', content: 'nmap -sV {{ip}}' }
      ]
    },
    { id: 'g2', title: 'Web', items: [{ id: 'c', title: 'Diretórios', content: 'ffuf -u {{url}}/FUZZ' }] }
  ]
  const ids = (q: string): string[] => matchSnippets(groups, q).map((m) => m.item.id)

  it('sem busca, lista todos na ordem', () => {
    expect(ids('')).toEqual(['a', 'b', 'c'])
  })

  it('busca no título, no grupo e no conteúdo, com o título primeiro', () => {
    expect(ids('nmap')).toEqual(['b', 'a'])
    expect(ids('web')).toEqual(['c'])
  })

  it('ignora acento e caixa, e exige todas as palavras', () => {
    expect(ids('DIRETORIOS')).toEqual(['c'])
    expect(ids('nmap versoes')).toEqual(['b'])
    expect(ids('nmap ffuf')).toEqual([])
  })
})

describe('snippetText', () => {
  it('preenche as variáveis e tira quebras de linha do fim', () => {
    expect(snippetText('nmap {{ip}} {{porta}}\n\n', { ip: '10.0.0.5' })).toEqual({
      text: 'nmap 10.0.0.5 {{porta}}',
      missing: ['porta']
    })
  })

  it('sem valores, mantém as variáveis', () => {
    expect(snippetText('nmap {{ip}}')).toEqual({ text: 'nmap {{ip}}', missing: [] })
  })
})

describe('sheetSnippets', () => {
  const groups: SnippetGroup[] = [
    {
      id: 'g1',
      title: 'Rede',
      items: [
        { id: 'a', title: 'nmap', content: 'nmap -sV {{ip}}\n' },
        { id: 'b', title: 'curl', content: 'curl {{URL}}/{{caminho}}' },
        { id: 'c', title: 'servidor', content: 'python -m http.server 8000' }
      ]
    }
  ]

  it('preenche com os valores da ficha e diz o que falta', () => {
    const r = sheetSnippets(groups, { ip: '10.0.0.1', url: 'https://acme.com' })
    expect(r.map((s) => [s.item.id, s.text, s.missing, s.varCount])).toEqual([
      ['a', 'nmap -sV 10.0.0.1', [], 1],
      ['b', 'https://acme.com/{{caminho}}'.replace(/^/, 'curl '), ['caminho'], 2],
      ['c', 'python -m http.server 8000', [], 0]
    ])
  })

  it('filtra pela mesma busca do menu "/"', () => {
    expect(sheetSnippets(groups, {}, 'curl').map((s) => s.item.id)).toEqual(['b'])
    expect(sheetSnippets(groups, {}, 'rede http').map((s) => s.item.id)).toEqual(['c'])
  })
})
