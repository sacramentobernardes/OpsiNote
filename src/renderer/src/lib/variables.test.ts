import { describe, expect, it } from 'vitest'
import { createSheet, extractVars, matchVariables, resolveVars, sheetSkeleton, sheetValues, sheetVariables } from './variables'
import { SHEET_SPECS } from './sheets'

describe('extractVars', () => {
  it('lista as variáveis na ordem, sem repetir (ignorando acento e caixa)', () => {
    expect(extractVars('nmap {{IP}} -p {{ porta }} && ping {{ip}} {{domínio}} {{dominio}}')).toEqual(['IP', 'porta', 'domínio'])
  })

  it('aceita ponto, hífen e sublinhado no nome', () => {
    expect(extractVars('{{api.url}} {{porta_web}} {{host-2}}')).toEqual(['api.url', 'porta_web', 'host-2'])
  })

  it('não confunde chaves simples ou vazias', () => {
    expect(extractVars('{ip} {{}} {{ }}')).toEqual([])
  })
})

describe('resolveVars', () => {
  const values = { ip: '10.0.0.5', dominio: 'acme.com' }

  it('troca as variáveis pelos valores sem diferenciar acento e caixa', () => {
    expect(resolveVars('nmap -sV {{IP}} && dig {{Domínio}}', values)).toEqual({
      text: 'nmap -sV 10.0.0.5 && dig acme.com',
      missing: []
    })
  })

  it('mantém e lista as que não têm valor', () => {
    expect(resolveVars('curl {{url}}/{{url}} {{ip}}', values)).toEqual({ text: 'curl {{url}}/{{url}} 10.0.0.5', missing: ['url'] })
  })
})

describe('sheetValues', () => {
  it('usa só valores preenchidos e, em chave repetida, o primeiro', () => {
    const sheet = createSheet([])
    sheet.vars = [
      { id: '1', key: 'IP', value: '1.1.1.1' },
      { id: '2', key: 'ip', value: '2.2.2.2' },
      { id: '3', key: 'url', value: '   ' }
    ]
    expect(sheetValues(sheet)).toEqual({ ip: '1.1.1.1' })
  })

  it('aceita ficha ausente', () => {
    expect(sheetValues(undefined)).toEqual({})
  })
})

describe('createSheet / sheetSkeleton', () => {
  it('cria a ficha com as chaves padrão de cada categoria', () => {
    expect(createSheet(SHEET_SPECS.pentest.defaultKeys).vars.map((v) => v.key)).toEqual(['alvo', 'ip', 'dominio', 'url'])
    expect(createSheet(SHEET_SPECS.study.defaultKeys).vars.map((v) => v.key)).toEqual(['tema', 'curso'])
    expect(createSheet().vars).toEqual([])
  })

  it('copia só as chaves, com ids novos e valores vazios', () => {
    const sheet = createSheet(['ip'])
    sheet.vars[0].value = '10.0.0.1'
    sheet.fields.scope = 'tudo'
    const copy = sheetSkeleton(sheet)!
    expect(copy.vars).toHaveLength(1)
    expect(copy.vars[0]).toMatchObject({ key: 'ip', value: '' })
    expect(copy.vars[0].id).not.toBe(sheet.vars[0].id)
    expect(copy.fields).toEqual({})
  })
})

describe('variáveis no menu do "/"', () => {
  it('lista as chaves da ficha sem repetir nem vazias', () => {
    const sheet = {
      vars: [
        { id: '1', key: 'ip', value: '10.0.0.1' },
        { id: '2', key: ' IP ', value: 'outro' },
        { id: '3', key: '', value: 'x' },
        { id: '4', key: 'Domínio', value: 'acme.htb' }
      ],
      fields: {}
    }
    expect(sheetVariables(sheet)).toEqual([
      { key: 'ip', value: '10.0.0.1' },
      { key: 'Domínio', value: 'acme.htb' }
    ])
  })

  it('busca na chave e no valor, sem acento, com as que começam pela busca primeiro', () => {
    const vars = [
      { key: 'url', value: 'https://acme.htb' },
      { key: 'dominio', value: 'acme.htb' },
      { key: 'porta_web', value: '8080' }
    ]
    expect(matchVariables(vars, 'Dom').map((v) => v.key)).toEqual(['dominio'])
    expect(matchVariables(vars, 'acme').map((v) => v.key)).toEqual(['url', 'dominio'])
    expect(matchVariables(vars, 'web').map((v) => v.key)).toEqual(['porta_web'])
    expect(matchVariables(vars, '')).toHaveLength(3)
  })
})
