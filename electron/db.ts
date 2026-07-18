// SQLite chat history + per-chat context (recurrent-state token log).
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export type Chat = { id: string; title: string; created_at: number; updated_at: number }
export type Message = { id: string; chat_id: string; role: 'user' | 'assistant'; content: string; tok_s: number | null; created_at: number }

export class Store {
  db: Database.Database
  constructor(path: string) {
    this.db = new Database(path)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY, title TEXT NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, role TEXT NOT NULL,
        content TEXT NOT NULL, tok_s REAL, created_at INTEGER NOT NULL,
        FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE);
      -- per-chat context: ordered token ids fed to the recurrent runtime
      CREATE TABLE IF NOT EXISTS context (
        chat_id TEXT NOT NULL, seq INTEGER NOT NULL, token INTEGER NOT NULL,
        PRIMARY KEY(chat_id, seq));
      CREATE INDEX IF NOT EXISTS idx_msg_chat ON messages(chat_id, created_at);
    `)
  }
  listChats(): Chat[] { return this.db.prepare('SELECT * FROM chats ORDER BY updated_at DESC').all() as Chat[] }
  createChat(title = 'New chat'): Chat {
    const now = Date.now(), id = randomUUID()
    this.db.prepare('INSERT INTO chats(id,title,created_at,updated_at) VALUES(?,?,?,?)').run(id, title, now, now)
    return { id, title, created_at: now, updated_at: now }
  }
  renameChat(id: string, title: string) { this.db.prepare('UPDATE chats SET title=?, updated_at=? WHERE id=?').run(title, Date.now(), id) }
  deleteChat(id: string) { this.db.prepare('DELETE FROM chats WHERE id=?').run(id); this.db.prepare('DELETE FROM messages WHERE chat_id=?').run(id); this.db.prepare('DELETE FROM context WHERE chat_id=?').run(id) }
  touch(id: string) { this.db.prepare('UPDATE chats SET updated_at=? WHERE id=?').run(Date.now(), id) }
  messages(chatId: string): Message[] { return this.db.prepare('SELECT * FROM messages WHERE chat_id=? ORDER BY created_at').all(chatId) as Message[] }
  addMessage(chatId: string, role: Message['role'], content: string, tokS: number | null = null): Message {
    const now = Date.now(), id = randomUUID()
    this.db.prepare('INSERT INTO messages(id,chat_id,role,content,tok_s,created_at) VALUES(?,?,?,?,?,?)').run(id, chatId, role, content, tokS, now)
    this.touch(chatId)
    return { id, chat_id: chatId, role, content, tok_s: tokS, created_at: now }
  }
  // context (token log) for warm re-priming when switching chats
  contextTokens(chatId: string): number[] { return (this.db.prepare('SELECT token FROM context WHERE chat_id=? ORDER BY seq').all(chatId) as { token: number }[]).map(r => r.token) }
  appendContext(chatId: string, tokens: number[]) {
    const start = (this.db.prepare('SELECT COALESCE(MAX(seq),-1) s FROM context WHERE chat_id=?').get(chatId) as { s: number }).s + 1
    const ins = this.db.prepare('INSERT OR REPLACE INTO context(chat_id,seq,token) VALUES(?,?,?)')
    const tx = this.db.transaction((toks: number[]) => toks.forEach((t, i) => ins.run(chatId, start + i, t)))
    tx(tokens)
  }
}
