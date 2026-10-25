import { describe, expect, it } from 'vitest'
import { fold, foldWithMap, htmlToText, remoteImagesToLinks } from './text'

describe('htmlToText', () => {
  it('tira as tags e junta os espaços', () => {
    expect(htmlToText('<h2>Resumo</h2><p>Porta <b>80</b>\n aberta</p>')).toBe('Resumo Porta 80 aberta')
  })

  it('decodifica entidades nomeadas e numéricas', () => {
    expect(htmlToText('<p>a &amp; b &lt;x&gt; &#233; &#xE7; &nbsp;fim</p>')).toBe('a & b <x> é ç fim')
  })

  it('ignora o conteúdo de script e style', () => {
    expect(htmlToText('<style>p{}</style><p>ok</p><script>alert(1)</script>')).toBe('ok')
  })
})

describe('fold', () => {
  it('remove acentos e maiúsculas', () => {
    expect(fold('Domínio AÇÃO')).toBe('dominio acao')
  })
})

describe('foldWithMap', () => {
  it('mapeia cada caractere dobrado para a posição original', () => {
    const { folded, map } = foldWithMap('Ação')
    expect(folded).toBe('acao')
    expect(map).toEqual([0, 1, 2, 3, 4])
  })

  it('acompanha textos que crescem ao dobrar (coreano)', () => {
    const text = 'x 한국 y'
    const { folded, map } = foldWithMap(text)
    expect(folded.length).toBeGreaterThan(text.length)
    const at = folded.indexOf('y')
    expect(text.slice(map[at], map[at + 1])).toBe('y')
    expect(map.at(-1)).toBe(text.length)
  })
})

describe('remoteImagesToLinks', () => {
  it('troca imagem da internet por link e mantém as locais', () => {
    const html =
      '<p>a</p><img src="https://site.com/p.png?a=1&amp;b=2" alt="x"><img alt="y" src=\'//cdn.com/t.gif\'>' +
      '<img src="opsinote-asset://files/abc.png"><img src="data:image/png;base64,AAAA">'
    expect(remoteImagesToLinks(html)).toBe(
      '<p>a</p><p><a href="https://site.com/p.png?a=1&amp;b=2">[imagem externa] https://site.com/p.png?a=1&amp;b=2</a></p>' +
        '<p><a href="https://cdn.com/t.gif">[imagem externa] https://cdn.com/t.gif</a></p>' +
        '<img src="opsinote-asset://files/abc.png"><img src="data:image/png;base64,AAAA">'
    )
  })
})
