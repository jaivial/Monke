// Cross-platform native runtime build. Run: node native/build.mjs
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { platform } from 'node:os'
const dir = new URL('.', import.meta.url).pathname
mkdirSync(dir + 'bin', { recursive: true })
const src = dir + 'monke_runtime.c'
const p = platform()
const out = dir + 'bin/monke_runtime' + (p === 'win32' ? '.exe' : '')
function has(cmd){ try { execSync(`${cmd} --version`, {stdio:'ignore'}); return true } catch { return false } }
let cmd
if (p === 'win32') {
  // MSVC (cl) if available, else clang/gcc via MinGW
  if (has('cl')) cmd = `cl /O2 /openmp /Fe:"${out}" "${src}" psapi.lib`
  else cmd = `gcc -O3 -fopenmp "${src}" -o "${out}" -lm -lpsapi`
} else if (p === 'darwin') {
  // Apple clang has no OpenMP by default; build single-thread (still fast for one stream)
  cmd = `clang -O3 -ffast-math "${src}" -o "${out}" -lm`
} else {
  cmd = `gcc -O3 -march=native -fopenmp "${src}" -o "${out}" -lm`
}
console.log('[monke] building runtime:', cmd)
execSync(cmd, { stdio: 'inherit', cwd: dir })
console.log('[monke] built', out)
