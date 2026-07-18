/// <reference types="vite/client" />
import type { MonkeAPI } from '../electron/preload'
declare global { interface Window { monke: MonkeAPI } }
export {}
