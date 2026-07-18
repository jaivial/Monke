import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { platform, cpus } from 'node:os'
import { Store } from './db.js'
import { Engine } from './inference.js'
import { sample } from './stats.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isDev = !app.isPackaged
// MONKE runs inference on CPU only; the UI needs no GPU. Disabling hardware
// acceleration removes GL/vsync driver noise (GetVSyncParametersIfAvailable
// warnings) on Linux hosts without changing anything visible.
app.disableHardwareAcceleration()
const RES = isDev ? join(__dirname, '..') : process.resourcesPath
const MODEL_DIR = process.env.MONKE_MODEL_DIR || join(RES, 'model')
const DATA_DIR = process.env.MONKE_DATA_DIR || MODEL_DIR
const BIN = join(RES, 'native', 'bin', 'monke_runtime' + (platform() === 'win32' ? '.exe' : ''))
// Human-readable name of the running model. Overridable for custom models via
// MONKE_MODEL_NAME; a model.json {"name":...} in the model dir also wins.
function modelName(): string {
  if (process.env.MONKE_MODEL_NAME) return process.env.MONKE_MODEL_NAME
  try {
    const meta = join(MODEL_DIR, 'model.json')
    if (existsSync(meta)) { const n = JSON.parse(readFileSync(meta, 'utf-8'))?.name; if (n) return String(n) }
  } catch {}
  return 'disk-routed-chat-0.5b'
}

let win: BrowserWindow
let store: Store
let engine: Engine | null = null
let lastRss = 0

function createWindow() {
  nativeTheme.themeSource = 'dark'
  win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 900, minHeight: 620,
    backgroundColor: '#0a0a0c', show: true,
    titleBarStyle: platform() === 'darwin' ? 'hiddenInset' : 'hidden',
    frame: false, trafficLightPosition: { x: 14, y: 16 },
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  })
  if (isDev && process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL)
  else win.loadFile(join(RES, 'dist', 'index.html'))
}

// ---- boot / middleware: load everything before the UI renders ----
ipcMain.handle('boot:init', async () => {
  const steps: { key: string; ok: boolean; detail?: string }[] = []
  const need = ['controller.bin', 'mem.i8', 'scale.txt', 'tokenizer.json']
  const missing = need.filter(f => !existsSync(join(MODEL_DIR, f)))
  steps.push({ key: 'model', ok: missing.length === 0, detail: missing.length ? 'missing: ' + missing.join(', ') : MODEL_DIR })
  const binOk = existsSync(BIN)
  steps.push({ key: 'runtime', ok: binOk, detail: binOk ? BIN : 'run `node native/build.mjs`' })
  try { store = new Store(join(DATA_DIR, 'monke.db')); steps.push({ key: 'database', ok: true }) }
  catch (e: any) { steps.push({ key: 'database', ok: false, detail: e.message }) }
  if (missing.length === 0 && binOk) {
    try {
      const scale = readFileSync(join(MODEL_DIR, 'scale.txt'), 'utf-8').trim()
      const threads = Math.min(16, Math.max(2, cpus().length))
      engine = new Engine(BIN, join(MODEL_DIR, 'controller.bin'), join(MODEL_DIR, 'mem.i8'), join(MODEL_DIR, 'tokenizer.json'), scale, threads)
      await engine.start()
      steps.push({ key: 'engine', ok: true, detail: `d=${engine.config?.D} L=${engine.config?.L} threads=${threads}` })
    } catch (e: any) { steps.push({ key: 'engine', ok: false, detail: e.message }) }
  } else steps.push({ key: 'engine', ok: false, detail: 'blocked by missing files' })
  return { ok: steps.every(s => s.ok), steps, model: MODEL_DIR, modelName: modelName() }
})

ipcMain.handle('model:name', () => modelName())

// ---- chats ----
ipcMain.handle('chats:list', () => store.listChats())
ipcMain.handle('chats:create', () => store.createChat())
ipcMain.handle('chats:delete', (_e, id: string) => { store.deleteChat(id); return true })
ipcMain.handle('chats:rename', (_e, id: string, title: string) => { store.renameChat(id, title); return true })
ipcMain.handle('chats:messages', (_e, id: string) => store.messages(id))

// ---- streaming generation ----
ipcMain.handle('chat:send', async (e, chatId: string, text: string, maxTokens = 160) => {
  if (!engine?.ready) throw new Error('engine not ready')
  const first = store.messages(chatId).length === 0
  store.addMessage(chatId, 'user', text)
  const ctx = store.contextTokens(chatId)
  const res = await engine.generate(chatId, text, ctx, maxTokens, (delta) => {
    e.sender.send('chat:delta', { chatId, delta })
  })
  lastRss = res.metrics.rssMb || lastRss
  store.appendContext(chatId, [...res.promptTokens, ...res.genTokens])
  store.addMessage(chatId, 'assistant', res.text, res.metrics.tokS)
  if (first) store.renameChat(chatId, text.slice(0, 40))
  e.sender.send('chat:done', { chatId, metrics: res.metrics })
  return { text: res.text, metrics: res.metrics }
})

// ---- stats ----
ipcMain.handle('stats:get', async () => sample(lastRss))

// ---- window controls (frameless) ----
ipcMain.on('win:min', () => win.minimize())
ipcMain.on('win:max', () => (win.isMaximized() ? win.unmaximize() : win.maximize()))
ipcMain.on('win:close', () => win.close())

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { engine?.stop(); if (platform() !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
