import { describe, expect, it } from 'vitest'
import { cleanOverrides, comboFromEvent, comboKeys, resolveBindings, setOverride, validateCombo, withHint } from './shortcuts'

const key = (code: string, mods: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean } = {}) => ({
  code,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift
})

describe('comboFromEvent', () => {
  it('monta a combinação na ordem Ctrl, Alt, Shift, tecla', () => {
    expect(comboFromEvent(key('KeyN', { shift: true, ctrl: true }))).toBe('Ctrl+Shift+KeyN')
    expect(comboFromEvent(key('ArrowUp', { alt: true }))).toBe('Alt+ArrowUp')
    expect(comboFromEvent(key('F1'))).toBe('F1')
  })

  it('trata Cmd como Ctrl e junta as teclas do teclado ABNT2', () => {
    expect(comboFromEvent(key('KeyK', { meta: true }))).toBe('Ctrl+KeyK')
    expect(comboFromEvent(key('IntlRo', { ctrl: true }))).toBe('Ctrl+Slash')
    expect(comboFromEvent(key('IntlBackslash', { ctrl: true }))).toBe('Ctrl+Backslash')
  })

  it('ignora modificadores sozinhos e teclas sem uso', () => {
    expect(comboFromEvent(key('ControlLeft', { ctrl: true }))).toBeNull()
    expect(comboFromEvent(key('ShiftRight', { shift: true }))).toBeNull()
    expect(comboFromEvent(key('Escape'))).toBeNull()
    expect(comboFromEvent(key('Tab', { ctrl: true }))).toBeNull()
  })
})

describe('comboKeys', () => {
  it('mostra nomes legíveis', () => {
    expect(comboKeys('Ctrl+Shift+KeyN')).toEqual(['Ctrl', 'Shift', 'N'])
    expect(comboKeys('Ctrl+Backslash')).toEqual(['Ctrl', '\\'])
    expect(comboKeys('Alt+ArrowDown')).toEqual(['Alt', '↓'])
    expect(comboKeys('Ctrl+Digit3')).toEqual(['Ctrl', '3'])
  })

  it('omite a dica quando o atalho está desativado', () => {
    expect(withHint('Novo espaço', 'Ctrl+Shift+KeyN')).toBe('Novo espaço (Ctrl+Shift+N)')
    expect(withHint('Novo espaço', null)).toBe('Novo espaço')
  })
})

describe('validateCombo', () => {
  const defaults = resolveBindings(undefined)

  it('aceita uma combinação livre', () => {
    expect(validateCombo('newWorkspace', 'Ctrl+Alt+F5', defaults)).toBeNull()
    expect(validateCombo('newWorkspace', 'Ctrl+Shift+KeyM', defaults)).toBeNull()
    expect(validateCombo('help', 'F2', defaults)).toBeNull()
  })

  it('recusa a combinação de outra ação, dizendo qual', () => {
    expect(validateCombo('duplicate', 'Ctrl+KeyK', defaults)).toMatch(/Buscar em tudo/)
    // A própria combinação não conta como conflito.
    expect(validateCombo('palette', 'Ctrl+KeyK', defaults)).toBeNull()
  })

  it('recusa teclas sem Ctrl ou Alt, que atrapalhariam a digitação', () => {
    expect(validateCombo('focus', 'KeyF', defaults)).toMatch(/Ctrl ou Alt/)
    expect(validateCombo('focus', 'Shift+KeyF', defaults)).toMatch(/Ctrl ou Alt/)
    expect(validateCombo('focus', 'Enter', defaults)).toMatch(/Ctrl ou Alt/)
  })

  it('recusa atalhos do editor e do sistema', () => {
    expect(validateCombo('focus', 'Ctrl+KeyC', defaults)).toMatch(/copiar/)
    expect(validateCombo('focus', 'Ctrl+KeyZ', defaults)).toMatch(/desfazer/)
    expect(validateCombo('focus', 'Ctrl+KeyB', defaults)).toMatch(/negrito/)
    expect(validateCombo('focus', 'Alt+F4', defaults)).toMatch(/fechar/)
    expect(validateCombo('focus', 'Ctrl+ArrowLeft', defaults)).toMatch(/cursor/)
  })

  it('recusa Ctrl+Alt com letras, que é o AltGr', () => {
    expect(validateCombo('focus', 'Ctrl+Alt+KeyQ', defaults)).toMatch(/AltGr/)
  })
})

describe('overrides', () => {
  it('voltar ao padrão remove a personalização', () => {
    const custom = setOverride({}, 'newWorkspace', 'Ctrl+Shift+KeyM')
    expect(custom).toEqual({ newWorkspace: 'Ctrl+Shift+KeyM' })
    expect(setOverride(custom, 'newWorkspace', 'Ctrl+Shift+KeyN')).toEqual({})
    expect(setOverride({}, 'help', null)).toEqual({ help: null })
    expect(resolveBindings({ help: null }).help).toBeNull()
  })

  it('descarta personalizações inválidas ou repetidas de um arquivo editado à mão', () => {
    expect(cleanOverrides({ palette: 'Ctrl+KeyJ', inexistente: 'Ctrl+KeyL', help: 42, focus: 'qualquer' })).toEqual({ palette: 'Ctrl+KeyJ' })
    // Igual ao padrão de outra ação: some, e a ação volta ao próprio padrão.
    expect(cleanOverrides({ duplicate: 'Ctrl+KeyK' })).toEqual({})
    // Duas personalizadas iguais: fica só uma.
    const twice = cleanOverrides({ duplicate: 'Ctrl+KeyJ', focus: 'Ctrl+KeyJ' })
    expect(Object.values(resolveBindings(twice)).filter((c) => c === 'Ctrl+KeyJ')).toHaveLength(1)
    expect(cleanOverrides({ help: null })).toEqual({ help: null })
    expect(cleanOverrides('lixo')).toEqual({})
  })
})
