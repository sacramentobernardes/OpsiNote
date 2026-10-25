import { contextBridge, ipcRenderer } from 'electron'

/** Resultado de uma gravação; `error` explica a falha para mostrar à pessoa. */
export type SaveResult = { ok: true } | { ok: false; error: string }

/** Arquivo escolhido para importar: o conteúdo, ou por que não deu para ler. */
export type ImportedFile = { name: string; text: string } | { name: string; error: string }

const api = {
  loadData: (): Promise<unknown> => ipcRenderer.invoke('data:load'),
  saveData: (json: string): Promise<SaveResult> => ipcRenderer.invoke('data:save', json),
  saveDataSync: (json: string): SaveResult => ipcRenderer.sendSync('data:save-sync', json),
  /** Salva um arquivo exportado; o tipo vem da extensão de `defaultName`. */
  exportFile: (content: string, defaultName: string): Promise<boolean> =>
    ipcRenderer.invoke('file:export', content, defaultName),
  /** Salva um pedaço da janela como PNG; false se a pessoa cancelou. */
  saveImage: (rect: { x: number; y: number; width: number; height: number }, defaultName: string): Promise<boolean> =>
    ipcRenderer.invoke('window:save-image', rect, defaultName),
  /** Abre um ou mais arquivos para importar; null se a pessoa cancelou. */
  importFile: (): Promise<ImportedFile[] | null> => ipcRenderer.invoke('file:import'),
  /** Grava uma imagem em attachments/ e devolve o endereço para usar no editor. */
  saveAsset: (bytes: Uint8Array, mime: string): Promise<string | null> => ipcRenderer.invoke('asset:save', bytes, mime),
  /** Avisa quando uma atualização terminou de baixar. Devolve a função para parar de ouvir. */
  onUpdateReady: (callback: (version: string) => void): (() => void) => {
    const listener = (_event: unknown, version: string): void => callback(version)
    ipcRenderer.on('update:ready', listener)
    return () => ipcRenderer.removeListener('update:ready', listener)
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  /** Versão do app e caminho do arquivo de dados, para a tela de configurações. */
  appInfo: (): Promise<{ version: string; dataFile: string }> => ipcRenderer.invoke('app:info'),
  openDataFolder: (): Promise<void> => ipcRenderer.invoke('app:open-data-folder'),
  /** Copia pelo processo principal: funciona mesmo sem a janela em foco. */
  copyText: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text)
}

export type OpsiNoteApi = typeof api

contextBridge.exposeInMainWorld('api', api)
