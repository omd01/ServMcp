const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// specific IPC functions with the main process
contextBridge.exposeInMainWorld(
  'api', {
    // MCP Server Management
    getMcpServers: () => ipcRenderer.invoke('get-mcp-servers'),
    importMcp: () => ipcRenderer.invoke('import-mcp'),
    installMcp: (mcpId, selectedTools) => ipcRenderer.invoke('install-mcp', mcpId, selectedTools),
    uninstallMcp: (mcpId) => ipcRenderer.invoke('uninstall-mcp', mcpId),
    startMcp: (mcpId) => ipcRenderer.invoke('start-mcp', mcpId),
    stopMcp: (mcpId) => ipcRenderer.invoke('stop-mcp', mcpId),
    
    // MCP Settings Management
    getMcpSettings: (mcpId) => ipcRenderer.invoke('get-mcp-settings', mcpId),
    saveMcpSettings: (mcpId, settings) => ipcRenderer.invoke('save-mcp-settings', { mcpId, settings }),
    
    // AI Tool Management
    toggleAiTool: (mcpId, toolId) => ipcRenderer.invoke('toggle-ai-tool', { mcpId, toolId }),
    saveCredentials: (toolId, credentials) => ipcRenderer.invoke('save-credentials', { toolId, credentials }),
    
    // Event listeners
    onMcpOutput: (callback) => ipcRenderer.on('mcp-output', (event, data) => callback(data)),
    onMcpError: (callback) => ipcRenderer.on('mcp-error', (event, data) => callback(data)),
    onMcpStopped: (callback) => ipcRenderer.on('mcp-stopped', (event, data) => callback(data)),
    
    // Remove event listeners when they are no longer needed
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('mcp-output');
      ipcRenderer.removeAllListeners('mcp-error');
      ipcRenderer.removeAllListeners('mcp-stopped');
    }
  }
); 