const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** Troca entidades como &amp; e &#233; pelos caracteres. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : m
    }
    return ENTITIES[code.toLowerCase()] ?? m
  })
}

/** O contrário, para pôr texto dentro de HTML. */
export const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Texto puro a partir do HTML do editor. Feito com expressões simples (sem DOM)
 * para funcionar também nos testes e ser rápido ao indexar muitas notas.
 */
export function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Minúsculas e sem acentos, para comparar "Domínio" com "dominio". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/**
 * Como `fold`, mas também diz de onde veio cada caractere: `map[i]` é a posição no texto
 * original do caractere `i` do texto dobrado (e `map[folded.length]` é o fim do texto).
 * Serve para destacar trechos achados no texto dobrado quando o tamanho muda
 * (ex.: sílabas coreanas, que se decompõem em mais de um caractere).
 */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = ''
  const map: number[] = []
  let at = 0
  for (const ch of text) {
    const f = fold(ch)
    for (let i = 0; i < f.length; i++) map.push(at)
    folded += f
    at += ch.length
  }
  map.push(at)
  return { folded, map }
}

const REMOTE_IMG_RE = /<img\b[^>]*?\ssrc\s*=\s*(["'])((?:https?:)?\/\/[^"']+)\1[^>]*>/gi

/**
 * Troca imagens da internet (<img src="https://…">) por um link para o endereço.
 * Abrir a nota nunca faz o app buscar nada fora do computador: carregar a imagem
 * revelaria o IP e o horário de quem está lendo para o site de origem.
 */
export function remoteImagesToLinks(html: string): string {
  return html.replace(REMOTE_IMG_RE, (_whole, _q: string, url: string) => {
    const href = url.startsWith('//') ? `https:${url}` : url
    return `<p><a href="${href}">[imagem externa] ${href}</a></p>`
  })
}
