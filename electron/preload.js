const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  dashboard: { get: () => ipcRenderer.invoke('dashboard:get') },
  parties: {
    getAll: () => ipcRenderer.invoke('parties:getAll'),
    get: (id) => ipcRenderer.invoke('parties:get', id),
    save: (p) => ipcRenderer.invoke('parties:save', p),
    delete: (id) => ipcRenderer.invoke('parties:delete', id),
  },
  items: {
    getAll: () => ipcRenderer.invoke('items:getAll'),
    get: (id) => ipcRenderer.invoke('items:get', id),
    save: (item) => ipcRenderer.invoke('items:save', item),
    delete: (id) => ipcRenderer.invoke('items:delete', id),
  },
  invoices: {
    getAll: (type) => ipcRenderer.invoke('invoices:getAll', type),
    get: (id) => ipcRenderer.invoke('invoices:get', id),
    save: (inv) => ipcRenderer.invoke('invoices:save', inv),
    delete: (id) => ipcRenderer.invoke('invoices:delete', id),
  },
  accounts: {
    getAll: () => ipcRenderer.invoke('accounts:getAll'),
    save: (acc) => ipcRenderer.invoke('accounts:save', acc),
  },
  journal: {
    getAll: () => ipcRenderer.invoke('journal:getAll'),
    save: (entry) => ipcRenderer.invoke('journal:save', entry),
  },
  reports: {
    trialBalance: () => ipcRenderer.invoke('reports:trialBalance'),
    profitLoss: (from, to) => ipcRenderer.invoke('reports:profitLoss', from, to),
  },
  ai: {
    parseVoiceEntry: (text) => ipcRenderer.invoke('ai:parseVoiceEntry', text),
  },
  company: {
    get: () => ipcRenderer.invoke('company:get'),
    save: (c) => ipcRenderer.invoke('company:save', c),
  },
})
