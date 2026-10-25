/**
 * Atualização automática (electron-updater). Só funciona no app instalado e
 * depois que um local de publicação for configurado no electron-builder.yml
 * (veja o README); sem isso, não faz nada.
 */
import { app, ipcMain, type BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000
let started = false

/** Chamado uma vez, com a primeira janela. */
export function setupAutoUpdate(win: BrowserWindow): void {
  if (started) return
  started = true
  ipcMain.handle('update:install', () => autoUpdater.quitAndInstall())

  // O electron-builder só gera app-update.yml quando há "publish" configurado.
  if (!app.isPackaged || !existsSync(join(process.resourcesPath, 'app-update.yml'))) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('update-downloaded', (info) => {
    if (!win.isDestroyed()) win.webContents.send('update:ready', info.version)
  })
  autoUpdater.on('error', (err) => console.error('Falha ao buscar atualização:', err.message))

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err: Error) => console.error('Falha ao buscar atualização:', err.message))
  }
  check()
  setInterval(check, CHECK_EVERY_MS)
}
