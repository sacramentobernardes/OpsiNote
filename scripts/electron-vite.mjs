// Roda o electron-vite sem ELECTRON_RUN_AS_NODE. Alguns ambientes (como
// terminais abertos por extensões do VS Code) definem essa variável, o que
// faz o Electron iniciar como Node puro e o app fechar sem abrir a janela.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const cli = join(dirname(require.resolve('electron-vite/package.json')), 'bin', 'electron-vite.js')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)))
