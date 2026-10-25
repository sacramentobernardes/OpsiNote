type SaveResult = { ok: true } | { ok: false; error: string }

interface OpsiNoteApi {
  loadData(): Promise<unknown>
  saveData(json: string): Promise<SaveResult>
  saveDataSync(json: string): SaveResult
  exportFile(content: string, defaultName: string): Promise<boolean>
  saveImage(rect: { x: number; y: number; width: number; height: number }, defaultName: string): Promise<boolean>
  importFile(): Promise<({ name: string; text: string } | { name: string; error: string })[] | null>
  saveAsset(bytes: Uint8Array, mime: string): Promise<string | null>
  onUpdateReady(callback: (version: string) => void): () => void
  installUpdate(): Promise<void>
  copyText(text: string): Promise<void>
  appInfo(): Promise<{ version: string; dataFile: string }>
  openDataFolder(): Promise<void>
}

interface Window {
  api: OpsiNoteApi
}
