const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const initSqlJs = require('sql.js')

const isDev = process.env.NODE_ENV === 'development'

app.commandLine.appendSwitch('enable-speech-dispatcher')
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
app.commandLine.appendSwitch('use-fake-ui-for-media-stream')

let win
let db
let SQL

const DB_PATH = path.join(app.getPath('userData'), 'fynlo.db')

async function initDB() {
  SQL = await initSqlJs()
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      gstin TEXT,
      address TEXT,
      phone TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      group_name TEXT,
      opening_balance REAL DEFAULT 0,
      balance REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS parties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'both',
      phone TEXT,
      email TEXT,
      address TEXT,
      gstin TEXT,
      balance REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT DEFAULT 'Nos',
      purchase_price REAL DEFAULT 0,
      sale_price REAL DEFAULT 0,
      stock REAL DEFAULT 0,
      low_stock_alert REAL DEFAULT 10,
      hsn_code TEXT,
      gst_rate REAL DEFAULT 18
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT NOT NULL,
      type TEXT NOT NULL,
      party_id INTEGER,
      party_name TEXT,
      date TEXT NOT NULL,
      total REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      grand_total REAL DEFAULT 0,
      paid REAL DEFAULT 0,
      status TEXT DEFAULT 'unpaid',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (party_id) REFERENCES parties(id)
    );
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER,
      item_id INTEGER,
      item_name TEXT,
      qty REAL,
      rate REAL,
      amount REAL,
      gst_rate REAL DEFAULT 0,
      gst_amount REAL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );
    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      narration TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS journal_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER,
      account_id INTEGER,
      account_name TEXT,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      FOREIGN KEY (entry_id) REFERENCES journal_entries(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
  `)
  const res = db.exec('SELECT COUNT(*) as c FROM accounts')
  const count = res[0]?.values[0][0]
  if (count === 0) {
    const defaultAccounts = [
      ['Cash', 'asset', 'Current Assets'],
      ['Bank', 'asset', 'Current Assets'],
      ['Sales', 'income', 'Direct Income'],
      ['Purchase', 'expense', 'Direct Expense'],
      ['Stock in Hand', 'asset', 'Current Assets'],
      ['Capital Account', 'liability', 'Capital Account'],
      ['Sundry Debtors', 'asset', 'Current Assets'],
      ['Sundry Creditors', 'liability', 'Current Liabilities'],
      ['GST Payable', 'liability', 'Duties & Taxes'],
      ['Input Tax Credit', 'asset', 'Current Assets'],
    ]
    defaultAccounts.forEach(([name, type, group]) => {
      db.run('INSERT INTO accounts (name, type, group_name) VALUES (?, ?, ?)', [name, type, group])
    })
  }
  saveDB()
}

function saveDB() {
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Fynlo — Smart Business Software',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
    icon: path.join(__dirname, '../public/icon.png'),
  })
  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(async () => {
  await initDB()
  createWindow()
})

app.on('window-all-closed', () => {
  saveDB()
  if (process.platform !== 'darwin') app.quit()
})

function queryAll(sql, params = []) {
  try {
    const res = db.exec(sql, params)
    if (!res.length) return []
    const { columns, values } = res[0]
    return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])))
  } catch (e) { return [] }
}

function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null
}

ipcMain.handle('dashboard:get', () => {
  const today = new Date().toISOString().split('T')[0]
  const monthStart = today.slice(0, 7) + '-01'
  const todaySales = queryOne(`SELECT COALESCE(SUM(grand_total),0) as val FROM invoices WHERE type='sale' AND date=?`, [today])
  const monthSales = queryOne(`SELECT COALESCE(SUM(grand_total),0) as val FROM invoices WHERE type='sale' AND date>=?`, [monthStart])
  const totalParties = queryOne(`SELECT COUNT(*) as val FROM parties`)
  const lowStock = queryAll(`SELECT * FROM items WHERE stock <= low_stock_alert AND stock >= 0`)
  const recentInvoices = queryAll(`SELECT * FROM invoices ORDER BY created_at DESC LIMIT 5`)
  const cashBal = queryOne(`SELECT balance FROM accounts WHERE name='Cash'`)
  const bankBal = queryOne(`SELECT balance FROM accounts WHERE name='Bank'`)
  const salesChart = db.exec(`SELECT date, SUM(grand_total) as total FROM invoices WHERE type='sale' AND date >= date('now','-30 days') GROUP BY date ORDER BY date`)
  const chartData = salesChart[0] ? salesChart[0].values.map(r => ({ date: r[0], total: r[1] })) : []
  return {
    todaySales: todaySales?.val || 0,
    monthSales: monthSales?.val || 0,
    totalParties: totalParties?.val || 0,
    lowStockCount: lowStock.length,
    cashBalance: cashBal?.balance || 0,
    bankBalance: bankBal?.balance || 0,
    recentInvoices,
    salesChart: chartData,
    lowStockItems: lowStock,
  }
})

ipcMain.handle('parties:getAll', () => queryAll('SELECT * FROM parties ORDER BY name'))
ipcMain.handle('parties:get', (_, id) => queryOne('SELECT * FROM parties WHERE id=?', [id]))
ipcMain.handle('parties:save', (_, p) => {
  if (p.id) {
    db.run('UPDATE parties SET name=?,type=?,phone=?,email=?,address=?,gstin=? WHERE id=?',
      [p.name, p.type, p.phone, p.email, p.address, p.gstin, p.id])
  } else {
    db.run('INSERT INTO parties (name,type,phone,email,address,gstin) VALUES (?,?,?,?,?,?)',
      [p.name, p.type, p.phone, p.email, p.address, p.gstin])
  }
  saveDB()
  return { success: true }
})
ipcMain.handle('parties:delete', (_, id) => {
  db.run('DELETE FROM parties WHERE id=?', [id])
  saveDB()
  return { success: true }
})

ipcMain.handle('items:getAll', () => queryAll('SELECT * FROM items ORDER BY name'))
ipcMain.handle('items:get', (_, id) => queryOne('SELECT * FROM items WHERE id=?', [id]))
ipcMain.handle('items:save', (_, item) => {
  if (item.id) {
    db.run('UPDATE items SET name=?,unit=?,purchase_price=?,sale_price=?,stock=?,low_stock_alert=?,hsn_code=?,gst_rate=? WHERE id=?',
      [item.name, item.unit, item.purchase_price, item.sale_price, item.stock, item.low_stock_alert, item.hsn_code, item.gst_rate, item.id])
  } else {
    db.run('INSERT INTO items (name,unit,purchase_price,sale_price,stock,low_stock_alert,hsn_code,gst_rate) VALUES (?,?,?,?,?,?,?,?)',
      [item.name, item.unit, item.purchase_price, item.sale_price, item.stock, item.low_stock_alert, item.hsn_code, item.gst_rate])
  }
  saveDB()
  return { success: true }
})
ipcMain.handle('items:delete', (_, id) => {
  db.run('DELETE FROM items WHERE id=?', [id])
  saveDB()
  return { success: true }
})

ipcMain.handle('invoices:getAll', (_, type) => {
  const sql = type ? 'SELECT * FROM invoices WHERE type=? ORDER BY date DESC' : 'SELECT * FROM invoices ORDER BY date DESC'
  return queryAll(sql, type ? [type] : [])
})
ipcMain.handle('invoices:get', (_, id) => {
  const invoice = queryOne('SELECT * FROM invoices WHERE id=?', [id])
  if (!invoice) return null
  invoice.items = queryAll('SELECT * FROM invoice_items WHERE invoice_id=?', [id])
  return invoice
})
ipcMain.handle('invoices:save', (_, inv) => {
  if (inv.id) {
    db.run('UPDATE invoices SET invoice_no=?,type=?,party_id=?,party_name=?,date=?,total=?,tax=?,grand_total=?,paid=?,status=?,notes=? WHERE id=?',
      [inv.invoice_no, inv.type, inv.party_id, inv.party_name, inv.date, inv.total, inv.tax, inv.grand_total, inv.paid, inv.status, inv.notes, inv.id])
    db.run('DELETE FROM invoice_items WHERE invoice_id=?', [inv.id])
  } else {
    db.run('INSERT INTO invoices (invoice_no,type,party_id,party_name,date,total,tax,grand_total,paid,status,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [inv.invoice_no, inv.type, inv.party_id, inv.party_name, inv.date, inv.total, inv.tax, inv.grand_total, inv.paid, inv.status, inv.notes])
    inv.id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
  }
  inv.items?.forEach(item => {
    db.run('INSERT INTO invoice_items (invoice_id,item_id,item_name,qty,rate,amount,gst_rate,gst_amount) VALUES (?,?,?,?,?,?,?,?)',
      [inv.id, item.item_id, item.item_name, item.qty, item.rate, item.amount, item.gst_rate || 0, item.gst_amount || 0])
    if (inv.type === 'sale') {
      db.run('UPDATE items SET stock = stock - ? WHERE id=?', [item.qty, item.item_id])
    } else if (inv.type === 'purchase') {
      db.run('UPDATE items SET stock = stock + ? WHERE id=?', [item.qty, item.item_id])
    }
    if (inv.party_id) {
      const delta = inv.type === 'sale' ? inv.grand_total : -inv.grand_total
      db.run('UPDATE parties SET balance = balance + ? WHERE id=?', [delta, inv.party_id])
    }
  })
  saveDB()
  return { success: true, id: inv.id }
})
ipcMain.handle('invoices:delete', (_, id) => {
  db.run('DELETE FROM invoice_items WHERE invoice_id=?', [id])
  db.run('DELETE FROM invoices WHERE id=?', [id])
  saveDB()
  return { success: true }
})

ipcMain.handle('accounts:getAll', () => queryAll('SELECT * FROM accounts ORDER BY type, name'))
ipcMain.handle('accounts:save', (_, acc) => {
  if (acc.id) {
    db.run('UPDATE accounts SET name=?,type=?,group_name=?,opening_balance=?,balance=? WHERE id=?',
      [acc.name, acc.type, acc.group_name, acc.opening_balance, acc.balance, acc.id])
  } else {
    db.run('INSERT INTO accounts (name,type,group_name,opening_balance,balance) VALUES (?,?,?,?,?)',
      [acc.name, acc.type, acc.group_name, acc.opening_balance || 0, acc.opening_balance || 0])
  }
  saveDB()
  return { success: true }
})

ipcMain.handle('journal:getAll', () => {
  const entries = queryAll('SELECT * FROM journal_entries ORDER BY date DESC')
  return entries.map(e => ({
    ...e,
    lines: queryAll('SELECT * FROM journal_lines WHERE entry_id=?', [e.id])
  }))
})
ipcMain.handle('journal:save', (_, entry) => {
  db.run('INSERT INTO journal_entries (date, narration) VALUES (?,?)', [entry.date, entry.narration])
  const eid = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
  entry.lines?.forEach(l => {
    db.run('INSERT INTO journal_lines (entry_id,account_id,account_name,debit,credit) VALUES (?,?,?,?,?)',
      [eid, l.account_id, l.account_name, l.debit || 0, l.credit || 0])
    db.run('UPDATE accounts SET balance = balance + ? - ? WHERE id=?', [l.credit, l.debit, l.account_id])
  })
  saveDB()
  return { success: true }
})

ipcMain.handle('reports:trialBalance', () => queryAll('SELECT * FROM accounts ORDER BY type'))
ipcMain.handle('reports:profitLoss', (_, from, to) => {
  const income = queryAll(`SELECT party_name, SUM(grand_total) as total FROM invoices WHERE type='sale' AND date BETWEEN ? AND ? GROUP BY party_name`, [from, to])
  const expense = queryAll(`SELECT party_name, SUM(grand_total) as total FROM invoices WHERE type='purchase' AND date BETWEEN ? AND ? GROUP BY party_name`, [from, to])
  const totalIncome = income.reduce((s, r) => s + r.total, 0)
  const totalExpense = expense.reduce((s, r) => s + r.total, 0)
  return { income, expense, totalIncome, totalExpense, netProfit: totalIncome - totalExpense }
})

ipcMain.handle('ai:parseVoiceEntry', (_, text) => {
  const lower = text.toLowerCase()
  let result = { type: null, amount: null, party: null, item: null, narration: text }
  const amtMatch = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:rupee|rupay|rs|₹)?/i)
  if (amtMatch) result.amount = parseFloat(amtMatch[1].replace(/,/g, ''))
  if (/sale|becha|bika|diya|sold/i.test(lower)) result.type = 'sale'
  else if (/purchase|kharida|liya|bought/i.test(lower)) result.type = 'purchase'
  else if (/payment|paid|diya|mila|received/i.test(lower)) result.type = 'payment'
  const partyMatch = text.match(/(?:ko|se|from|to)\s+([A-Za-z\s]+?)(?:\s+(?:ka|ki|ke|mein|par|ko|se|,|$))/i)
  if (partyMatch) result.party = partyMatch[1].trim()
  return result
})

ipcMain.handle('company:get', () => queryOne('SELECT * FROM companies LIMIT 1'))
ipcMain.handle('company:save', (_, c) => {
  const existing = queryOne('SELECT id FROM companies LIMIT 1')
  if (existing) {
    db.run('UPDATE companies SET name=?,gstin=?,address=?,phone=? WHERE id=?', [c.name, c.gstin, c.address, c.phone, existing.id])
  } else {
    db.run('INSERT INTO companies (name,gstin,address,phone) VALUES (?,?,?,?)', [c.name, c.gstin, c.address, c.phone])
  }
  saveDB()
  return { success: true }
})
