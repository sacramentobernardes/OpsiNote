// Gera docs/OpsiNote-Manual.pdf a partir de docs/manual/manual.html, usando o
// próprio Electron do projeto para imprimir a página (nenhuma dependência extra).
// Este arquivo roda duas vezes: pelo Node (npm run docs:pdf), que só abre o
// Electron apontando para ele mesmo, e dentro do Electron, que faz a impressão.
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'docs', 'manual', 'manual.html')
const output = join(root, 'docs', 'OpsiNote-Manual.pdf')

if (!process.versions.electron) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [fileURLToPath(import.meta.url)], { stdio: 'inherit', env })
  child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
} else {
  // Sem await no nível do módulo: o Electron só dispara o "ready" depois que o
  // módulo principal termina de carregar, então esperar por ele aqui travaria.
  const { app, BrowserWindow } = require('electron')
  app.disableHardwareAcceleration()
  app.whenReady().then(build)

  async function build() {
    // A versão na capa vem do package.json. A página preenchida é gravada ao lado
    // da original (com outro nome) para os caminhos relativos das imagens valerem.
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    const html = readFileSync(source, 'utf8').replaceAll('{{versao}}', version)
    const page = join(dirname(source), `.manual-${process.pid}.html`)
    writeFileSync(page, html)

    try {
      const win = new BrowserWindow({ show: false })
      await win.loadURL(pathToFileURL(page).href)
      await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
      const pdf = await win.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        generateDocumentOutline: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="width:100%;font:8pt Segoe UI,sans-serif;color:#78716c;padding:0 18mm;display:flex;justify-content:space-between">' +
          `<span>Manual do OpsiNote · v${version}</span><span class="pageNumber"></span></div>`
      })
      writeFileSync(output, pdf)
      console.log(`Manual gerado em ${output}`)
    } catch (err) {
      console.error(err)
      process.exitCode = 1
    } finally {
      rmSync(page, { force: true })
      app.quit()
    }
  }
}
