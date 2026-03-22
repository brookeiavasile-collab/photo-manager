import { API_BASE_URL, isTauriApp } from './api'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

let eventSource = null;
let listeners = [];
let addressUpdateCallbacks = [];
let tauriUnlisten = null;

const API_BASE = API_BASE_URL;

const scanService = {
  state: {
    scanning: false,
    scanningDir: null,
    scannedCount: 0,
    progress: null,
    result: null,
    queued: [],
    queuePosition: 0,
    logs: [],
    categorySync: {
      isRunning: false,
      processedCount: 0,
      totalCount: 0
    }
  },

  subscribe(listener) {
    listeners.push(listener);
    listener(this.state);
    
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  },

  notifyAll() {
    listeners.forEach(listener => listener(this.state));
  },

  onAddressUpdate(callback) {
    addressUpdateCallbacks.push(callback);
    return () => {
      addressUpdateCallbacks = addressUpdateCallbacks.filter(c => c !== callback);
    };
  },

  notifyAddressUpdate() {
    addressUpdateCallbacks.forEach(callback => callback());
  },

  getState() {
    return this.state;
  },

  addLog(logEntry) {
    const nextLogs = [...this.state.logs, {
      ...logEntry,
      timestamp: logEntry.timestamp || Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }].slice(-200)
    this.state.logs = nextLogs
  },

  async clearLogs() {
    if (isTauriApp) {
      this.state.logs = [];
      this.notifyAll();
      return;
    }
    
    try {
      await fetch(`${API_BASE}/directories/scan-logs/clear`, { method: 'POST' });
    } catch (error) {
      console.error('Failed to clear scan logs:', error);
    }

    this.state.logs = [];
    this.notifyAll();
  },

  async checkAndResume() {
    if (isTauriApp) {
      await this.setupTauriListener()
      try {
        const serverState = await invoke('get_scan_state')
        const logs = (serverState.logs || []).map((entry, index) => ({
          ...entry,
          type: entry.logType || entry.type || 'info',
          id: `restored-${Date.now()}-${index}`
        }))

        this.state = {
          ...this.state,
          scanning: serverState.scanning || false,
          scanningDir: serverState.currentDir || null,
          scannedCount: serverState.scannedCount || 0,
          progress: serverState.scanning
            ? {
                type: 'file',
                current: serverState.scannedCount || 0,
                total: serverState.totalCount || 0,
                filename: serverState.currentPath || ''
              }
            : null,
          result: null,
          queued: serverState.queue || [],
          queuePosition: 0,
          logs
        }
        this.notifyAll()
      } catch (error) {
        console.error('Failed to restore Tauri scan state:', error)
      }
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/directories/scan-state`);
      const serverState = await response.json();
      
      if (serverState.isScanning || (serverState.queue && serverState.queue.length > 0)) {
        this.state = {
          ...this.state,
          scanning: serverState.isScanning,
          scanningDir: serverState.currentDir,
          scannedCount: serverState.scannedCount || 0,
          progress: serverState.currentPath ? {
            type: 'file',
            path: serverState.currentPath,
            current: serverState.scannedCount
          } : null,
          result: null,
          queued: serverState.queue || [],
          queuePosition: 0
        };
        this.notifyAll();
        
        if (serverState.isScanning && serverState.currentDir) {
          this.connectGlobalSSE();
        }
      }
      
      if (serverState.logs && serverState.logs.length > 0) {
        this.state.logs = serverState.logs;
        this.notifyAll();
      }
      
      if (serverState.categorySync?.isRunning) {
        this.state.categorySync = {
          isRunning: true,
          processedCount: serverState.categorySync.processedCount || 0,
          totalCount: serverState.categorySync.totalCount || 0
        };
        this.connectGlobalSSE();
        this.notifyAll();
      }
    } catch (error) {
      console.error('Failed to check scan state:', error);
    }
  },

  connectGlobalSSE() {
    if (isTauriApp || eventSource) {
      return;
    }

    eventSource = new EventSource(`${API_BASE}/directories/scan-global`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleEvent(data);
    };
    
    eventSource.onerror = () => {
      this.state.scanning = false;
      this.state.progress = null;
      this.state.result = { success: false, error: '扫描连接中断' };
      this.notifyAll();
      
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  },

  async setupTauriListener() {
    if (!isTauriApp || tauriUnlisten) return;
    
    tauriUnlisten = await listen('scan-progress', (event) => {
      const data = event.payload;
      this.handleTauriEvent(data);
    });
  },

  handleTauriEvent(data) {
    if (data.type === 'started') {
      this.state.scanning = true;
      this.state.scanningDir = data.dirPath;
      this.state.scannedCount = 0;
      this.state.progress = null;
      this.state.result = null;
      this.state.logs = [];
    } else if (data.type === 'file') {
      this.state.scannedCount = data.current;
      this.state.progress = {
        type: 'file',
        current: data.current,
        total: data.total,
        filename: data.filename
      };
    } else if (data.type === 'progress') {
      // ignored, we get log event instead
    } else if (data.type === 'complete') {
      this.state.scanning = false;
      this.state.progress = null;
      this.state.result = { success: true };
      this.state.scanningDir = null;
      this.notifyAddressUpdate();
    } else if (data.type === 'stopped') {
      this.state.scanning = false;
      this.state.progress = null;
      this.state.result = { success: false, error: '扫描已取消' };
      this.state.scanningDir = null;
    } else if (data.type === 'log') {
      if (data.logEntry) {
        this.addLog(data.logEntry);
      }
    }
    
    this.notifyAll();
  },

  handleEvent(data) {
    if (data.type === 'started') {
      this.state.scanning = true;
      this.state.scanningDir = data.dirPath;
      this.state.scannedCount = 0;
      this.state.queuePosition = 0;
      this.state.progress = null;
      this.state.result = null;
      this.state.logs = [];
      this.state.queued = this.state.queued.filter(d => d !== data.dirPath);
    } else if (data.type === 'queued') {
      if (!this.state.queued.includes(data.dirPath)) {
        this.state.queued = [...this.state.queued, data.dirPath];
      }
    } else if (data.type === 'file') {
      if (data.dirPath === this.state.scanningDir) {
        this.state.scannedCount = data.current;
        this.state.progress = data;
      }
    } else if (data.type === 'directory') {
      if (data.dirPath === this.state.scanningDir) {
        this.state.progress = data;
      }
    } else if (data.type === 'complete') {
      if (data.directory === this.state.scanningDir) {
        this.state.scanning = false;
        this.state.progress = null;
        this.state.result = data;
        this.state.scanningDir = null;
      }
      this.state.queued = this.state.queued.filter(d => d !== data.directory);
      this.notifyAddressUpdate();
    } else if (data.type === 'error') {
      if (data.dirPath === this.state.scanningDir) {
        this.state.scanning = false;
        this.state.progress = null;
        this.state.result = { success: false, error: data.error };
        this.state.scanningDir = null;
      }
      this.state.queued = this.state.queued.filter(d => d !== data.dirPath);
    } else if (data.type === 'stopped') {
      this.state.scanning = false;
      this.state.progress = null;
      this.state.result = { success: false, error: '扫描已取消' };
      this.state.scanningDir = null;
      this.state.queued = [];
    } else if (data.type === 'queue_updated') {
      this.state.queued = data.queue || [];
    } else if (data.type === 'log') {
      if (data.logEntry) {
        this.addLog(data.logEntry);
      }
    } else if (data.type === 'logs_init') {
      this.state.logs = data.logs || [];
    } else if (data.type === 'logs_cleared') {
      this.state.logs = [];
    } else if (data.type === 'category_sync_started') {
      this.state.categorySync = {
        isRunning: true,
        processedCount: data.processedCount || 0,
        totalCount: data.totalCount || 0
      };
    } else if (data.type === 'category_sync_progress') {
      this.state.categorySync.processedCount = data.processedCount;
      this.state.categorySync.totalCount = data.totalCount;
    } else if (data.type === 'category_sync_completed') {
      this.state.categorySync = {
        isRunning: false,
        processedCount: data.processedCount,
        totalCount: this.state.categorySync.totalCount || data.processedCount
      };
      this.notifyAddressUpdate();
    }
    
    if (!this.state.scanning && this.state.queued.length === 0 && 
        !this.state.categorySync.isRunning) {
      setTimeout(() => {
        if (!this.state.scanning && this.state.queued.length === 0 && 
            !this.state.categorySync.isRunning) {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
        }
      }, 500);
    }
    
    this.notifyAll();
  },

  async startScan(dirPath = null, options = {}) {
    if (isTauriApp) {
      await this.setupTauriListener();
      
      try {
        this.state.scanning = true;
        this.state.scanningDir = dirPath;
        this.state.progress = null;
        this.state.result = null;
        this.state.logs = [];
        this.notifyAll();
        
        await invoke('scan_directory', { path: dirPath, force: options.force || false });
        
        this.state.scanning = false;
        this.state.progress = null;
        this.state.result = { success: true };
        this.state.scanningDir = null;
        this.notifyAll();
        this.notifyAddressUpdate();
        
      } catch (error) {
        console.error('Failed to scan:', error);
        this.state.scanning = false;
        this.state.progress = null;
        this.state.result = { success: false, error: error.toString() };
        this.state.scanningDir = null;
        this.addLog({ message: `扫描失败: ${error}`, type: 'error' });
        this.notifyAll();
      }
      return;
    }

    if (this.state.scanning && this.state.scanningDir === dirPath) return;

    if (this.state.queued.includes(dirPath)) return;

    try {
      const response = await fetch(`${API_BASE}/directories/scan-request/${encodeURIComponent(dirPath)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ force: options.force || false })
      });
      const result = await response.json();
      
      if (result.status === 'started') {
        this.state.scanning = true;
        this.state.scanningDir = dirPath;
        this.state.scannedCount = 0;
        this.state.progress = null;
        this.state.result = null;
        this.connectGlobalSSE();
      } else if (result.status === 'queued' || result.status === 'already_queued') {
        if (!this.state.queued.includes(dirPath)) {
          this.state.queued = [...this.state.queued, dirPath];
        }
        this.connectGlobalSSE();
      } else if (result.status === 'already_scanning') {
        this.connectGlobalSSE();
      }
      
      this.notifyAll();
    } catch (error) {
      console.error('Failed to start scan:', error);
    }
  },

  async stopScan() {
    if (isTauriApp) {
      await invoke('stop_scan');
      this.state = {
        scanning: false,
        scanningDir: null,
        scannedCount: 0,
        progress: null,
        result: null,
        queued: [],
        queuePosition: 0,
        logs: this.state.logs,
        categorySync: {
          isRunning: false,
          processedCount: 0,
          totalCount: 0
        }
      };
      this.notifyAll();
      return;
    }
    
    try {
      await fetch(`${API_BASE}/directories/scan/stop`, { method: 'POST' });
    } catch (error) {
      console.error('Failed to stop scan:', error);
    }
    
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    this.state = {
      scanning: false,
      scanningDir: null,
      scannedCount: 0,
      progress: null,
      result: null,
      queued: [],
      queuePosition: 0,
      logs: this.state.logs,
      categorySync: {
        isRunning: false,
        processedCount: 0,
        totalCount: 0
      }
    };
    this.notifyAll();
  },

  clearResult() {
    this.state.result = null;
    this.notifyAll();
  }
};

export default scanService;
