import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, protocol, shell } from 'electron'
import { basename, join } from 'path'
import { promises as fs, writeFileSync, renameSync, copyFileSync, existsSync, readFileSync, rmSync, chmodSync } from 'fs'
import iconPng from '../../build/icon.png?asset'
import iconIco from '../../build/icon.ico?asset'
import {
  ASSET_PREFIX,
  ASSET_SCHEME,
  collectGarbage,
  externalizeImages,
  inlineImages,
  isAssetName,
  mimeOf,
  referencedAssets,
  saveAsset
} from './assets'
import { setupAutoUpdate } from './updater'

const dataFile = (): string => join(app.getPath('userData'), 'opsinote-data.json')

/*
 * Identidade do app no Windows (AppUserModelID): agrupa as janelas na barra de tarefas e decide
 * o ícone dela. O app instalado usa o mesmo id do atalho criado pelo instalador (appId do
 * electron-builder.yml). Em desenvolvimento o id é outro: o Windows guarda em cache o ícone
 * de cada id, e o do electron.exe (o átomo) ficaria preso ao id do app instalado.
 */
const APP_ID = app.isPackaged ? 'app.opsinote.notes' : 'app.opsinote.notes.dev'
const isWindows = process.platform === 'win32'
const assetsDir = (): string => join(app.getPath('userData'), 'attachments')
const DAY = 24 * 60 * 60 * 1000

// Precisa ser registrado antes do app ficar pronto.
protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

// O app se chamava MyMap: na primeira execução, traz os dados da pasta antiga.
async function migrateLegacyData(): Promise<void> {
  const file = dataFile()
  if (existsSync(file)) return
  const legacy = join(app.getPath('appData'), 'MyMap', 'mymap-data.json')
  if (!existsSync(legacy)) return
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.copyFile(legacy, file)
}

// Escritas são enfileiradas para nunca haver dois renames concorrentes.
let writeQueue: Promise<void> = Promise.resolve()

/*
 * Cada gravação recebe um número. A gravação síncrona do fechamento pode acontecer
 * no meio de uma assíncrona; o número impede que a assíncrona (mais velha) termine
 * depois e substitua o arquivo pelo conteúdo antigo.
 */
let writeSeq = 0
let committedSeq = 0

/*
 * Cópia de segurança da versão anterior. É um extra: se falhar, a gravação dos dados segue.
 * No Windows a cópia herda o atributo "somente leitura" do original; sem o chmod, um .bak
 * travado faria todas as gravações seguintes falharem.
 */
async function backup(file: string): Promise<void> {
  if (!existsSync(file)) return
  const bak = `${file}.bak`
  try {
    if (existsSync(bak)) await fs.chmod(bak, 0o666)
    await fs.copyFile(file, bak)
    await fs.chmod(bak, 0o666)
  } catch (err) {
    console.error('Falha ao criar a cópia de segurança', err)
  }
}

function backupSync(file: string): void {
  if (!existsSync(file)) return
  const bak = `${file}.bak`
  try {
    if (existsSync(bak)) chmodSync(bak, 0o666)
    copyFileSync(file, bak)
    chmodSync(bak, 0o666)
  } catch (err) {
    console.error('Falha ao criar a cópia de segurança', err)
  }
}

async function writeAtomic(json: string): Promise<void> {
  const seq = ++writeSeq
  // Imagens coladas ou importadas viram arquivos; o JSON guarda só o endereço.
  json = externalizeImages(json, assetsDir())
  const file = dataFile()
  const tmp = `${file}.${seq}.tmp`
  try {
    await fs.writeFile(tmp, json, 'utf8')
    if (seq < committedSeq) return
    await backup(file)
    if (seq < committedSeq) return
    committedSeq = seq
    await fs.rename(tmp, file)
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => {})
  }
}

function writeAtomicSync(json: string): void {
  const seq = ++writeSeq
  json = externalizeImages(json, assetsDir())
  const file = dataFile()
  const tmp = `${file}.${seq}.tmp`
  try {
    writeFileSync(tmp, json, 'utf8')
    backupSync(file)
    committedSeq = seq
    renameSync(tmp, file)
  } finally {
    rmSync(tmp, { force: true })
  }
}

const errorMessage = (err: unknown): string => {
  const e = err as NodeJS.ErrnoException
  if (e?.code === 'EPERM' || e?.code === 'EACCES') return 'sem permissão para gravar o arquivo de dados'
  if (e?.code === 'ENOSPC') return 'disco cheio'
  if (e?.code === 'EBUSY') return 'o arquivo está em uso por outro programa'
  return e?.message ?? String(err)
}

async function loadData(): Promise<unknown> {
  await migrateLegacyData()
  const file = dataFile()
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Arquivo corrompido: preserva uma cópia e tenta o backup antes de desistir.
    await fs.copyFile(file, `${file}.corrupt-${Date.now()}`)
    try {
      const bak = await fs.readFile(`${file}.bak`, 'utf8')
      const recovered = JSON.parse(bak)
      // Põe o backup no lugar do arquivo corrompido; senão a próxima gravação
      // copiaria o corrompido por cima do .bak bom.
      await fs.writeFile(file, bak, 'utf8')
      return recovered
    } catch {
      return null
    }
  }

  // Dados antigos com imagens embutidas: tira as imagens do JSON uma vez.
  if (raw.includes('data:image/')) {
    raw = externalizeImages(raw, assetsDir())
    await writeAtomic(raw)
    parsed = JSON.parse(raw)
  }
  removeUnusedAssets(raw)
  return parsed
}

/** Apaga imagens que nem os dados nem o backup anterior usam mais. */
function removeUnusedAssets(raw: string): void {
  try {
    const bak = `${dataFile()}.bak`
    const referenced = referencedAssets(raw + (existsSync(bak) ? readFileSync(bak, 'utf8') : ''))
    collectGarbage(assetsDir(), referenced, DAY)
  } catch (err) {
    console.error('Falha ao limpar imagens sem uso', err)
  }
}

function isSafeExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: 'OpsiNote',
    // No Windows o .ico, com cada tamanho desenhado (16 a 256 px), fica nítido na barra de tarefas.
    icon: isWindows ? iconIco : iconPng,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#15130f' : '#f7f6f3',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true
    }
  })

  // O ícone da barra de tarefas no Windows vem do app, não da janela: sem isto, rodando pelo
  // electron.exe (npm run dev), aparece o átomo do Electron. Precisa vir antes de a janela aparecer.
  if (isWindows) {
    win.setAppDetails({
      appId: APP_ID,
      appIconPath: app.isPackaged ? process.execPath : iconIco,
      appIconIndex: 0,
      relaunchDisplayName: 'OpsiNote'
    })
  }

  win.once('ready-to-show', () => win.show())
  setupAutoUpdate(win)

  // A janela cancela o fechamento quando não conseguiu salvar; aqui a pessoa decide.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'OpsiNote',
      message: 'Não foi possível salvar as últimas alterações.',
      detail: 'Se fechar agora, elas serão perdidas. Verifique se o disco tem espaço e se o arquivo de dados não está bloqueado, e tente de novo.',
      buttons: ['Continuar no app', 'Fechar sem salvar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    // preventDefault aqui ignora o cancelamento e deixa a janela fechar.
    if (choice === 1) event.preventDefault()
  })

  // Links nunca abrem dentro do app: vão para o navegador padrão.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault()
      if (isSafeExternalUrl(url)) shell.openExternal(url)
    }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('data:load', () => loadData())

/** Resultado de uma gravação: a janela avisa a pessoa quando falha. */
type SaveResult = { ok: true } | { ok: false; error: string }

ipcMain.handle('data:save', (_event, json: unknown): Promise<SaveResult> => {
  if (typeof json !== 'string') return Promise.resolve({ ok: false, error: 'dados inválidos' })
  const result = writeQueue.then(() => writeAtomic(json))
  writeQueue = result.catch(() => {})
  return result.then(
    (): SaveResult => ({ ok: true }),
    (err): SaveResult => {
      console.error('Falha ao salvar', err)
      return { ok: false, error: errorMessage(err) }
    }
  )
})

// Usado ao fechar a janela, quando não dá para esperar uma promise.
ipcMain.on('data:save-sync', (event, json: unknown) => {
  let result: SaveResult = { ok: false, error: 'dados inválidos' }
  if (typeof json === 'string') {
    try {
      writeAtomicSync(json)
      result = { ok: true }
    } catch (err) {
      console.error('Falha ao salvar', err)
      result = { ok: false, error: errorMessage(err) }
    }
  }
  event.returnValue = result
})

/** Formatos de exportação e importação, pela extensão. */
const FILE_TYPES: Record<string, string> = {
  json: 'Backup do OpsiNote',
  html: 'Página HTML',
  md: 'Markdown',
  csv: 'Planilha CSV',
  txt: 'Texto simples'
}
const IMPORT_EXTENSIONS = ['json', 'html', 'htm', 'md', 'markdown', 'csv', 'tsv', 'txt']
/** Arquivos maiores que isso não são de notas: provavelmente o arquivo errado. */
const MAX_IMPORT_BYTES = 200 * 1024 * 1024

ipcMain.handle('file:export', async (event, content: unknown, defaultName: unknown) => {
  if (typeof content !== 'string') return false
  const win = BrowserWindow.fromWebContents(event.sender)
  const name = typeof defaultName === 'string' ? defaultName : 'opsinote-backup.json'
  const ext = name.split('.').pop()?.toLowerCase() ?? 'json'
  const options = {
    defaultPath: name,
    filters: [{ name: FILE_TYPES[ext] ?? 'Arquivo', extensions: [ext] }]
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return false
  // O arquivo leva as imagens embutidas, para funcionar em outro computador.
  await fs.writeFile(result.filePath, inlineImages(content, assetsDir()), 'utf8')
  return true
})

/** Salva um pedaço da janela como PNG (o grafo). `rect` em pixels da página. */
ipcMain.handle('window:save-image', async (event, rect: unknown, defaultName: unknown) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const r = rect as { x?: unknown; y?: unknown; width?: unknown; height?: unknown } | null
  const nums = [r?.x, r?.y, r?.width, r?.height]
  if (!win || !nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return false
  const [x, y, width, height] = (nums as number[]).map((n) => Math.round(n))
  if (width <= 0 || height <= 0) return false
  const image = await win.webContents.capturePage({ x: Math.max(0, x), y: Math.max(0, y), width, height })
  const result = await dialog.showSaveDialog(win, {
    defaultPath: typeof defaultName === 'string' ? defaultName : 'opsinote-grafo.png',
    filters: [{ name: 'Imagem PNG', extensions: ['png'] }]
  })
  if (result.canceled || !result.filePath) return false
  await fs.writeFile(result.filePath, image.toPNG())
  return true
})

ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataFile: dataFile() }))

ipcMain.handle('app:open-data-folder', () => {
  // Abre a pasta com o arquivo já selecionado no Explorador.
  shell.showItemInFolder(dataFile())
})

ipcMain.handle('clipboard:write', (_event, text: unknown) => {
  if (typeof text === 'string') clipboard.writeText(text)
})

ipcMain.handle('asset:save', (_event, bytes: unknown, mime: unknown) => {
  if (!(bytes instanceof Uint8Array) || typeof mime !== 'string') return null
  const name = saveAsset(assetsDir(), bytes, mime)
  return name ? ASSET_PREFIX + name : null
})

/** Abre um ou mais arquivos e devolve nome e conteúdo de cada um (ou o erro, para avisar qual falhou). */
ipcMain.handle('file:import', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const options = {
    properties: ['openFile' as const, 'multiSelections' as const],
    filters: [
      { name: 'Todos os formatos aceitos', extensions: IMPORT_EXTENSIONS },
      { name: 'Backup do OpsiNote', extensions: ['json'] },
      { name: 'Página HTML', extensions: ['html', 'htm'] },
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: 'Planilha CSV', extensions: ['csv', 'tsv'] },
      { name: 'Texto simples', extensions: ['txt'] }
    ]
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return Promise.all(
    result.filePaths.map(async (path) => {
      const name = basename(path)
      try {
        if ((await fs.stat(path)).size > MAX_IMPORT_BYTES) return { name, error: 'arquivo grande demais (mais de 200 MB)' }
        return { name, text: await fs.readFile(path, 'utf8') }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        return { name, error: code === 'EBUSY' ? 'o arquivo está em uso por outro programa' : (err as Error).message }
      }
    })
  )
})

// Uma instância só: duas janelas gravando o mesmo arquivo apagariam as alterações
// uma da outra. Abrir de novo só traz a janela existente para a frente.
const isPrimary = app.requestSingleInstanceLock()
if (!isPrimary) app.quit()

app.on('second-instance', () => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

app.whenReady().then(() => {
  if (!isPrimary) return
  app.setAppUserModelId(APP_ID)

  // Serve as imagens de attachments/; só aceita nomes gerados pelo app.
  protocol.handle(ASSET_SCHEME, async (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\//, ''))
    if (!isAssetName(name)) return new Response('Não encontrado', { status: 404 })
    try {
      const body = await fs.readFile(join(assetsDir(), name))
      return new Response(body, { headers: { 'content-type': mimeOf(name), 'cache-control': 'max-age=31536000, immutable' } })
    } catch {
      return new Response('Não encontrado', { status: 404 })
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
