const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Store = require('electron-store');
const AdmZip = require('adm-zip');
const yaml = require('js-yaml');
const { exec } = require('child_process');

// Define default MCP configuration
const defaultMcpConfig = {
  mcpServers: [
    {
      id: 'default-mcp',
      name: 'Default MCP Server',
      description: 'Pre-installed MCP server for demonstration',
      installed: false,
      running: false,
      type: 'simple',
      version: '1.0.0',
      path: null,
      aiTools: [
        { id: 'claude', name: 'Claude', connected: false, requiresCredentials: true },
        { id: 'cursor', name: 'Cursor', connected: false, requiresCredentials: true }
      ]
    }
  ],
  credentials: {},
  mcpSettings: {}
};

// Initialize persistent storage
const store = new Store({
  name: 'mcp-manager-config',
  defaults: defaultMcpConfig
});

// Ensure the mcpServers array is populated
if (!store.has('mcpServers') || !Array.isArray(store.get('mcpServers')) || store.get('mcpServers').length === 0) {
  store.set('mcpServers', defaultMcpConfig.mcpServers);
  console.log('Initialized default MCP servers');
}

// Keep a global reference of the window object
let mainWindow;
// Keep track of running MCP processes
const mcpProcesses = {};

// Define the local MCP directory
const mcpBaseDir = path.join(app.getPath('userData'), 'mcp-servers');

// Ensure the MCP directory exists
if (!fs.existsSync(mcpBaseDir)) {
  fs.mkdirSync(mcpBaseDir, { recursive: true });
}

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src/main/preload.js')
    }
  });

  // Load the index.html file
  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));

  // Open DevTools during development
  mainWindow.webContents.openDevTools();

  // Handle window being closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Stop all running MCP processes when the app is closed
    Object.keys(mcpProcesses).forEach(mcpId => {
      if (mcpProcesses[mcpId] && !mcpProcesses[mcpId].killed) {
        mcpProcesses[mcpId].kill();
      }
    });
  });
}

// Create window when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, recreate window when dock icon is clicked and no windows are open
  if (mainWindow === null) {
    createWindow();
  }
});

// Helper function to detect MCP type and structure
async function detectMcpType(mcpDir) {
  try {
    // Check for package.json (Node.js MCP)
    const packageJsonPath = path.join(mcpDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Check if it's a TypeScript project
      const isTypescript = fs.existsSync(path.join(mcpDir, 'tsconfig.json'));
      
      // Check for smithery.yaml which contains MCP configuration
      const smitheryConfig = fs.existsSync(path.join(mcpDir, 'smithery.yaml')) ? 
        yaml.load(fs.readFileSync(path.join(mcpDir, 'smithery.yaml'), 'utf8')) : null;
      
      return {
        type: 'nodejs',
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        isTypescript,
        hasSmitheryConfig: !!smitheryConfig,
        configSchema: smitheryConfig?.startCommand?.configSchema,
        mainScript: packageJson.bin ? 
          Object.values(packageJson.bin)[0] : 
          (packageJson.main || 'index.js'),
        dependencies: packageJson.dependencies || {},
        needsCompilation: isTypescript && (!fs.existsSync(path.join(mcpDir, 'dist')) || 
          Object.keys(fs.readdirSync(path.join(mcpDir, 'dist'))).length === 0)
      };
    }
    
    // Check for manifest.json (Simple MCP)
    const manifestPath = path.join(mcpDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return {
        type: 'simple',
        name: manifest.name,
        id: manifest.id,
        version: manifest.version,
        description: manifest.description,
        mainScript: manifest.main,
        aiTools: manifest.aiTools
      };
    }
    
    return { type: 'unknown' };
  } catch (error) {
    console.error('Error detecting MCP type:', error);
    return { type: 'unknown', error: error.message };
  }
}

// IPC handlers for MCP server management

// Get the list of available MCP servers
ipcMain.handle('get-mcp-servers', () => {
  return store.get('mcpServers');
});

// Get MCP settings
ipcMain.handle('get-mcp-settings', (event, mcpId) => {
  return store.get(`mcpSettings.${mcpId}`) || {};
});

// Save MCP settings
ipcMain.handle('save-mcp-settings', (event, { mcpId, settings }) => {
  store.set(`mcpSettings.${mcpId}`, settings);
  return { success: true };
});

// Import MCP from a zip file
ipcMain.handle('import-mcp', async (event) => {
  try {
    // Open file dialog to select the MCP zip file
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'MCP Packages', extensions: ['zip'] }],
      title: 'Select MCP Package'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'No file selected' };
    }

    const zipFilePath = result.filePaths[0];
    const zip = new AdmZip(zipFilePath);
    
    // Create a temporary directory to extract the zip
    const tempExtractDir = path.join(app.getPath('temp'), `mcp-extract-${Date.now()}`);
    fs.mkdirSync(tempExtractDir, { recursive: true });
    
    // Extract the zip to the temporary directory
    zip.extractAllTo(tempExtractDir, true);
    
    // Check if the zip contains a directory at the root
    const rootItems = fs.readdirSync(tempExtractDir);
    const rootDir = rootItems.length === 1 && 
      fs.statSync(path.join(tempExtractDir, rootItems[0])).isDirectory() ? 
      path.join(tempExtractDir, rootItems[0]) : tempExtractDir;
    
    // Detect the MCP type and structure
    const mcpInfo = await detectMcpType(rootDir);
    
    if (mcpInfo.type === 'unknown') {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
      return { success: false, message: 'Invalid MCP package: could not detect type' };
    }
    
    // Generate a unique ID for the MCP if not available
    const mcpId = mcpInfo.id || mcpInfo.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    
    // Create directory for this MCP
    const mcpDir = path.join(mcpBaseDir, mcpId);
    if (fs.existsSync(mcpDir)) {
      fs.rmSync(mcpDir, { recursive: true, force: true });
    }
    fs.mkdirSync(mcpDir, { recursive: true });
    
    // Copy files from the root directory to the MCP directory
    copyFolderRecursive(rootDir, mcpDir);
    
    // Update the MCP servers list
    const mcpServers = store.get('mcpServers');
    
    // Check if this MCP ID already exists
    const existingIndex = mcpServers.findIndex(mcp => mcp.id === mcpId);
    
    // Prepare the MCP server object
    const mcpServer = {
      id: mcpId,
      name: mcpInfo.name,
      description: mcpInfo.description || `MCP server ${mcpInfo.name}`,
      version: mcpInfo.version,
      installed: false,
      running: false,
      path: mcpDir,
      type: mcpInfo.type,
      hasConfig: mcpInfo.hasSmitheryConfig,
      configSchema: mcpInfo.configSchema,
      mainScript: mcpInfo.mainScript,
      isTypescript: mcpInfo.isTypescript,
      needsCompilation: mcpInfo.needsCompilation,
      aiTools: mcpInfo.aiTools || [
        { id: 'claude', name: 'Claude', connected: false, requiresCredentials: true },
        { id: 'cursor', name: 'Cursor', connected: false, requiresCredentials: true }
      ]
    };
    
    // If the MCP already exists, update it, otherwise add it
    if (existingIndex !== -1) {
      mcpServers[existingIndex] = mcpServer;
    } else {
      mcpServers.push(mcpServer);
    }
    
    store.set('mcpServers', mcpServers);
    
    // Clean up the temporary directory
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
    
    // Update external MCP configuration if tools were selected
    if (mcpInfo.aiTools && mcpInfo.aiTools.length > 0) {
      try {
        // Define path to the external config file
        const externalConfigPath = path.join(app.getPath('home'), '.cursor', 'mcp.json');
        
        // Read the existing config if it exists
        let externalConfig = { mcpServers: {} };
        if (fs.existsSync(externalConfigPath)) {
          const fileContent = fs.readFileSync(externalConfigPath, 'utf8');
          try {
            externalConfig = JSON.parse(fileContent);
          } catch (e) {
            console.error('Error parsing external config file:', e);
          }
        }
        
        // Make sure mcpServers exists
        if (!externalConfig.mcpServers) {
          externalConfig.mcpServers = {};
        }
        
        // Add or update the MCP configuration
        if (mcpId === 'mongodb-mcp' || mcpId === 'mongo-mcp') {
          // Special configuration for MongoDB MCP
          externalConfig.mcpServers['mongodb'] = {
            command: 'npx',
            args: [
              'mongo-mcp',
              'mongodb://<username>:<password>@<host>:<port>/<database>?authSource=admin'
            ],
            env: {}
          };
          
          if (mainWindow) {
            mainWindow.webContents.send('mcp-output', { 
              mcpId, 
              data: `MongoDB MCP configuration added to external config. You'll need to update the connection string later.\n` 
            });
          }
        } else {
          // Default configuration for other MCPs
          externalConfig.mcpServers[mcpId] = {
            command: 'node',
            args: [path.join(mcpDir, mcpServer.mainScript)],
            env: {}
          };
        }
        
        // Save the updated config
        fs.writeFileSync(externalConfigPath, JSON.stringify(externalConfig, null, 2));
        
        if (mainWindow) {
          mainWindow.webContents.send('mcp-output', { 
            mcpId, 
            data: `MCP configuration updated for tools: ${mcpInfo.aiTools.map(tool => tool.name).join(', ')}\n` 
          });
        }
      } catch (error) {
        console.error('Error updating external config:', error);
        if (mainWindow) {
          mainWindow.webContents.send('mcp-error', { 
            mcpId, 
            data: `Warning: Failed to update external tool configuration: ${error.message}` 
          });
        }
      }
    }
    
    return { 
      success: true, 
      message: 'MCP package imported successfully',
      mcpId: mcpId,
      hasConfig: mcpInfo.hasSmitheryConfig,
      mcpType: mcpInfo.type
    };
  } catch (error) {
    console.error('Error importing MCP:', error);
    return { success: false, message: `Error importing MCP: ${error.message}` };
  }
});

// Helper function to recursively copy folders
function copyFolderRecursive(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  
  const files = fs.readdirSync(source);
  
  for (const file of files) {
    const sourceFile = path.join(source, file);
    const targetFile = path.join(target, file);
    const stats = fs.statSync(sourceFile);
    
    if (stats.isDirectory()) {
      copyFolderRecursive(sourceFile, targetFile);
    } else {
      fs.copyFileSync(sourceFile, targetFile);
    }
  }
}

// Install an MCP server
ipcMain.handle('install-mcp', async (event, mcpId, selectedTools) => {
  const mcpServers = store.get('mcpServers');
  const mcpIndex = mcpServers.findIndex(mcp => mcp.id === mcpId);
  
  if (mcpIndex === -1) return { success: false, message: 'MCP server not found' };
  
  try {
    const mcp = mcpServers[mcpIndex];
    
    // Handle default MCP server with null path
    if (mcp.id === 'default-mcp' && !mcp.path) {
      // Create directory for default MCP
      const defaultMcpDir = path.join(mcpBaseDir, 'default-mcp');
      if (!fs.existsSync(defaultMcpDir)) {
        fs.mkdirSync(defaultMcpDir, { recursive: true });
      }
      
      // Create a basic server.js file
      const serverJsPath = path.join(defaultMcpDir, 'server.js');
      const serverJsContent = `
/**
 * Default MCP Server
 * This is a basic MCP server for demonstration
 */

console.log('Default MCP Server starting up...');

// Simulate initialization
setTimeout(() => {
  console.log('Initializing MCP components...');
}, 1000);

setTimeout(() => {
  console.log('MCP Server started successfully');
  console.log('Ready to process requests...');
}, 2000);

// Simulate activity
let counter = 0;
const interval = setInterval(() => {
  counter++;
  console.log(\`MCP Server heartbeat #\${counter}\`);
  
  // Occasionally log some additional information
  if (counter % 5 === 0) {
    console.log('System status: normal');
    console.log('Ready for AI interaction');
  }
  
  // Stop after a while if needed
  if (counter >= 100) {
    clearInterval(interval);
    console.log('MCP Server shutting down normally...');
    process.exit(0);
  }
}, 3000);

// Handle termination
process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('MCP Server received shutdown signal');
  console.log('MCP Server shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  clearInterval(interval);
  console.log('MCP Server received termination signal');
  console.log('MCP Server shutting down...');
  process.exit(0);
});`;
      fs.writeFileSync(serverJsPath, serverJsContent);
      
      // Create a manifest.json file
      const manifestPath = path.join(defaultMcpDir, 'manifest.json');
      const manifestContent = JSON.stringify({
        id: 'default-mcp',
        name: 'Default MCP Server',
        version: '1.0.0',
        description: 'Pre-installed MCP server for demonstration',
        main: 'server.js',
        aiTools: [
          { id: 'claude', name: 'Claude', requiresCredentials: true },
          { id: 'cursor', name: 'Cursor', requiresCredentials: true }
        ]
      }, null, 2);
      fs.writeFileSync(manifestPath, manifestContent);
      
      // Update the MCP path in store
      mcpServers[mcpIndex].path = defaultMcpDir;
      mcpServers[mcpIndex].mainScript = 'server.js';
    }
    
    const mcpDir = mcpServers[mcpIndex].path;
    
    if (!fs.existsSync(mcpDir)) {
      return { success: false, message: 'MCP directory not found' };
    }
    
    // If it's a Node.js MCP, install dependencies
    if (mcp.type === 'nodejs') {
      await new Promise((resolve, reject) => {
        const process = exec('npm install', {
          cwd: mcpDir
        });
        
        process.stdout.on('data', (data) => {
          if (mainWindow) {
            mainWindow.webContents.send('mcp-output', { mcpId, data: data.toString() });
          }
        });
        
        process.stderr.on('data', (data) => {
          if (mainWindow) {
            mainWindow.webContents.send('mcp-output', { mcpId, data: data.toString() });
          }
        });
        
        process.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`npm install failed with code ${code}`));
          }
        });
      });
      
      // If TypeScript MCP needs compilation
      if (mcp.isTypescript && mcp.needsCompilation) {
        await new Promise((resolve, reject) => {
          const process = exec('npm run build', {
            cwd: mcpDir
          });
          
          process.stdout.on('data', (data) => {
            if (mainWindow) {
              mainWindow.webContents.send('mcp-output', { mcpId, data: data.toString() });
            }
          });
          
          process.stderr.on('data', (data) => {
            if (mainWindow) {
              mainWindow.webContents.send('mcp-output', { mcpId, data: data.toString() });
            }
          });
          
          process.on('close', (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`npm run build failed with code ${code}`));
            }
          });
        });
      }
    }
    
    // Mark the MCP as installed
    mcpServers[mcpIndex].installed = true;
    store.set('mcpServers', mcpServers);
    
    // Update external MCP configuration if tools were selected
    if (selectedTools && selectedTools.length > 0) {
      try {
        // Define path to the external config file
        const externalConfigPath = path.join(app.getPath('home'), '.cursor', 'mcp.json');
        
        // Read the existing config if it exists
        let externalConfig = { mcpServers: {} };
        if (fs.existsSync(externalConfigPath)) {
          const fileContent = fs.readFileSync(externalConfigPath, 'utf8');
          try {
            externalConfig = JSON.parse(fileContent);
          } catch (e) {
            console.error('Error parsing external config file:', e);
          }
        }
        
        // Make sure mcpServers exists
        if (!externalConfig.mcpServers) {
          externalConfig.mcpServers = {};
        }
        
        // Add or update the MCP configuration
        if (mcpId === 'mongodb-mcp' || mcpId === 'mongo-mcp') {
          // Special configuration for MongoDB MCP
          externalConfig.mcpServers['mongodb'] = {
            command: 'npx',
            args: [
              'mongo-mcp',
              'mongodb://<username>:<password>@<host>:<port>/<database>?authSource=admin'
            ],
            env: {}
          };
          
          if (mainWindow) {
            mainWindow.webContents.send('mcp-output', { 
              mcpId, 
              data: `MongoDB MCP configuration added to external config. You'll need to update the connection string later.\n` 
            });
          }
        } else {
          // Default configuration for other MCPs
          externalConfig.mcpServers[mcpId] = {
            command: 'node',
            args: [path.join(mcpDir, mcp.mainScript)],
            env: {}
          };
        }
        
        // Save the updated config
        fs.writeFileSync(externalConfigPath, JSON.stringify(externalConfig, null, 2));
        
        if (mainWindow) {
          mainWindow.webContents.send('mcp-output', { 
            mcpId, 
            data: `MCP configuration updated for tools: ${selectedTools.join(', ')}\n` 
          });
        }
      } catch (error) {
        console.error('Error updating external config:', error);
        if (mainWindow) {
          mainWindow.webContents.send('mcp-error', { 
            mcpId, 
            data: `Warning: Failed to update external tool configuration: ${error.message}` 
          });
        }
      }
    }
    
    return { success: true, message: 'MCP server installed successfully' };
  } catch (error) {
    console.error('Error installing MCP:', error);
    return { success: false, message: `Installation failed: ${error.message}` };
  }
});

// Start an MCP server
ipcMain.handle('start-mcp', async (event, mcpId) => {
  const mcpServers = store.get('mcpServers');
  const mcpIndex = mcpServers.findIndex(mcp => mcp.id === mcpId);
  
  if (mcpIndex === -1) return { success: false, message: 'MCP server not found' };
  if (!mcpServers[mcpIndex].installed) return { success: false, message: 'MCP server not installed' };
  if (mcpServers[mcpIndex].running) return { success: false, message: 'MCP server already running' };
  
  try {
    const mcp = mcpServers[mcpIndex];
    
    // Check if this MCP has configuration requirements
    if (mcp.hasConfig && mcp.configSchema) {
      const settings = store.get(`mcpSettings.${mcpId}`);
      if (!settings || Object.keys(settings).length === 0) {
        return { 
          success: false, 
          message: 'MCP server requires configuration',
          requiresConfig: true,
          configSchema: mcp.configSchema
        };
      }
      
      // Check required fields in configuration
      const requiredFields = mcp.configSchema.required || [];
      for (const field of requiredFields) {
        if (!settings[field]) {
          return { 
            success: false, 
            message: `Required configuration field missing: ${field}`,
            requiresConfig: true,
            configSchema: mcp.configSchema
          };
        }
      }
    }
    
    let mcpProcess;
    
    // Start the MCP process based on its type
    if (mcp.type === 'nodejs') {
      const settings = store.get(`mcpSettings.${mcpId}`) || {};
      let args = [];
      
      if (mcp.hasConfig && settings) {
        // For MongoDB MCP, pass the MongoDB connection URL
        if (settings.mongoConnectionUrl) {
          args.push(settings.mongoConnectionUrl);
        }
      }
      
      if (mcp.isTypescript) {
        // For TypeScript MCPs, use the compiled JavaScript
        const mainScriptPath = path.join(mcp.path, mcp.mainScript);
        mcpProcess = spawn('node', [mainScriptPath, ...args]);
      } else {
        const mainScriptPath = path.join(mcp.path, mcp.mainScript);
        mcpProcess = spawn('node', [mainScriptPath, ...args]);
      }
    } else if (mcp.type === 'simple') {
      // For simple MCPs, just run the mainScript directly
      const mainScriptPath = path.join(mcp.path, mcp.mainScript);
      mcpProcess = spawn('node', [mainScriptPath]);
    } else {
      return { success: false, message: 'Unsupported MCP type' };
    }
    
    mcpProcess.stdout.on('data', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('mcp-output', { mcpId, data: data.toString() });
      }
    });
    
    mcpProcess.stderr.on('data', (data) => {
      if (mainWindow) {
        mainWindow.webContents.send('mcp-error', { mcpId, data: data.toString() });
      }
    });
    
    mcpProcess.on('close', (code) => {
      if (mainWindow) {
        mainWindow.webContents.send('mcp-stopped', { mcpId, code });
      }
      
      // Update the MCP server status
      const updatedMcpServers = store.get('mcpServers');
      const updatedMcpIndex = updatedMcpServers.findIndex(mcp => mcp.id === mcpId);
      if (updatedMcpIndex !== -1) {
        updatedMcpServers[updatedMcpIndex].running = false;
        store.set('mcpServers', updatedMcpServers);
      }
      
      delete mcpProcesses[mcpId];
    });
    
    // Store the process reference
    mcpProcesses[mcpId] = mcpProcess;
    
    // Update the MCP server status
    mcpServers[mcpIndex].running = true;
    store.set('mcpServers', mcpServers);
    
    return { success: true, message: 'MCP server started successfully' };
  } catch (error) {
    return { success: false, message: `Failed to start MCP server: ${error.message}` };
  }
});

// Stop an MCP server
ipcMain.handle('stop-mcp', async (event, mcpId) => {
  const mcpServers = store.get('mcpServers');
  const mcpIndex = mcpServers.findIndex(mcp => mcp.id === mcpId);
  
  if (mcpIndex === -1) return { success: false, message: 'MCP server not found' };
  if (!mcpServers[mcpIndex].installed) return { success: false, message: 'MCP server not installed' };
  if (!mcpServers[mcpIndex].running) return { success: false, message: 'MCP server not running' };
  
  // Stop the MCP process
  if (mcpProcesses[mcpId] && !mcpProcesses[mcpId].killed) {
    mcpProcesses[mcpId].kill();
    
    // Update the MCP server status
    mcpServers[mcpIndex].running = false;
    store.set('mcpServers', mcpServers);
    
    return { success: true, message: 'MCP server stopped successfully' };
  } else {
    return { success: false, message: 'MCP server process not found' };
  }
});

// Toggle AI tool connection
ipcMain.handle('toggle-ai-tool', async (event, { mcpId, toolId }) => {
  const mcpServers = store.get('mcpServers');
  const mcpIndex = mcpServers.findIndex(mcp => mcp.id === mcpId);
  
  if (mcpIndex === -1) return { success: false, message: 'MCP server not found' };
  
  const toolIndex = mcpServers[mcpIndex].aiTools.findIndex(tool => tool.id === toolId);
  if (toolIndex === -1) return { success: false, message: 'AI tool not found' };
  
  const tool = mcpServers[mcpIndex].aiTools[toolIndex];
  
  // Check if we need to request credentials
  if (!tool.connected && tool.requiresCredentials) {
    const credentials = store.get(`credentials.${toolId}`);
    
    if (!credentials) {
      return { 
        success: false, 
        message: 'Credentials required',
        requiresCredentials: true,
        toolId
      };
    }
  }
  
  // Toggle the connection status
  mcpServers[mcpIndex].aiTools[toolIndex].connected = !tool.connected;
  store.set('mcpServers', mcpServers);
  
  return { 
    success: true, 
    message: `AI tool ${tool.connected ? 'disconnected from' : 'connected to'} MCP server`
  };
});

// Save AI tool credentials
ipcMain.handle('save-credentials', async (event, { toolId, credentials }) => {
  // In a real app, you would encrypt these credentials
  store.set(`credentials.${toolId}`, credentials);
  return { success: true, message: 'Credentials saved successfully' };
});

// Uninstall an MCP server
ipcMain.handle('uninstall-mcp', async (event, mcpId) => {
  const mcpServers = store.get('mcpServers');
  const mcpIndex = mcpServers.findIndex(mcp => mcp.id === mcpId);
  
  if (mcpIndex === -1) return { success: false, message: 'MCP server not found' };
  
  try {
    const mcp = mcpServers[mcpIndex];
    
    // Check if the MCP is running
    if (mcp.running) {
      // Stop the MCP process
      if (mcpProcesses[mcpId] && !mcpProcesses[mcpId].killed) {
        mcpProcesses[mcpId].kill();
      }
    }
    
    // Remove the MCP directory if it exists
    if (mcp.path && fs.existsSync(mcp.path)) {
      fs.rmSync(mcp.path, { recursive: true, force: true });
    }
    
    // Remove MCP from external config file if needed
    try {
      const externalConfigPath = path.join(app.getPath('home'), '.cursor', 'mcp.json');
      if (fs.existsSync(externalConfigPath)) {
        const fileContent = fs.readFileSync(externalConfigPath, 'utf8');
        try {
          const externalConfig = JSON.parse(fileContent);
          
          // Check if this MCP is MongoDB
          if (mcpId === 'mongodb-mcp' || mcpId === 'mongo-mcp') {
            // Remove mongodb entry
            if (externalConfig.mcpServers && externalConfig.mcpServers.mongodb) {
              delete externalConfig.mcpServers.mongodb;
            }
          } else {
            // Remove the MCP entry
            if (externalConfig.mcpServers && externalConfig.mcpServers[mcpId]) {
              delete externalConfig.mcpServers[mcpId];
            }
          }
          
          // Save the updated config
          fs.writeFileSync(externalConfigPath, JSON.stringify(externalConfig, null, 2));
        } catch (e) {
          console.error('Error parsing or updating external config file:', e);
        }
      }
    } catch (error) {
      console.error('Error removing MCP from external config:', error);
    }
    
    // Update MCP status in store
    if (mcp.id === 'default-mcp') {
      // For default MCP, just mark as not installed
      mcpServers[mcpIndex].installed = false;
      mcpServers[mcpIndex].running = false;
      mcpServers[mcpIndex].path = null;
    } else {
      // For other MCPs, remove from the list
      mcpServers.splice(mcpIndex, 1);
    }
    
    store.set('mcpServers', mcpServers);
    
    // Remove any settings for this MCP
    const settings = store.get('mcpSettings') || {};
    if (settings[mcpId]) {
      delete settings[mcpId];
      store.set('mcpSettings', settings);
    }
    
    return { success: true, message: 'MCP server uninstalled successfully' };
  } catch (error) {
    console.error('Error uninstalling MCP:', error);
    return { success: false, message: `Uninstallation failed: ${error.message}` };
  }
}); 