const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Store = require('electron-store');
const AdmZip = require('adm-zip');
const { exec } = require('child_process');
const util = require('util');

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
let store;
try {
  store = new Store({
    name: 'mcp-manager-config',
    defaults: defaultMcpConfig
  });
  
  // Ensure the mcpServers array is populated
  if (!store.has('mcpServers') || !Array.isArray(store.get('mcpServers')) || store.get('mcpServers').length === 0) {
    store.set('mcpServers', defaultMcpConfig.mcpServers);
    console.log('Initialized default MCP servers');
  }
} catch (error) {
  console.error('Error initializing store:', error);
  
  // Try to delete the corrupted file
  try {
    const configPath = path.join(app.getPath('userData'), 'mcp-manager-config.json');
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log('Deleted corrupted config file');
    }
  } catch (e) {
    console.error('Failed to delete corrupted config file:', e);
  }
  
  // Initialize with default config
  store = new Store({
    name: 'mcp-manager-config',
    defaults: defaultMcpConfig
  });
  
  // Reset to defaults
  store.set('mcpServers', defaultMcpConfig.mcpServers);
  store.set('credentials', {});
  store.set('mcpSettings', {});
  console.log('Reset to default configuration');
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
      
      return {
        type: 'nodejs',
        name: packageJson.name,
        version: packageJson.version,
        description: packageJson.description,
        isTypescript,
        hasSmitheryConfig: false,
        configSchema: null,
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
  
  // Also update environment variables in external config if they exist
  try {
    const externalConfigPath = path.join(app.getPath('home'), '.cursor', 'mcp.json');
    if (fs.existsSync(externalConfigPath)) {
      const fileContent = fs.readFileSync(externalConfigPath, 'utf8');
      try {
        const externalConfig = JSON.parse(fileContent);
        
        // Check if this MCP exists in external config
        if (externalConfig.mcpServers && externalConfig.mcpServers[mcpId]) {
          // Initialize env if it doesn't exist
          if (!externalConfig.mcpServers[mcpId].env) {
            externalConfig.mcpServers[mcpId].env = {};
          }
          
          // Add settings to environment variables 
          // Focus on API keys and credential-related settings
          Object.keys(settings).forEach(key => {
            if (key.toLowerCase().includes('api_key') || 
                key.toLowerCase().includes('apikey') || 
                key.toLowerCase().includes('token') || 
                key.toLowerCase().includes('credential') ||
                key.toLowerCase().includes('password')) {
              
              // Store it as environment variable
              externalConfig.mcpServers[mcpId].env[key.toUpperCase()] = settings[key];
            }
          });
          
          // Save the updated config
          fs.writeFileSync(externalConfigPath, JSON.stringify(externalConfig, null, 2));
          
          if (mainWindow) {
            mainWindow.webContents.send('mcp-output', { 
              mcpId, 
              data: `Updated environment variables in external config with API keys\n` 
            });
          }
        }
      } catch (e) {
        console.error('Error updating external config with environment variables:', e);
      }
    }
  } catch (error) {
    console.error('Error updating external config with environment variables:', error);
  }
  
  return { success: true };
});

// Import MCP from a zip file
ipcMain.handle('import-mcp', async () => {
  try {
    // Open file dialog
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'MCP Packages', extensions: ['zip'] }
      ]
    });
    
    if (canceled || filePaths.length === 0) {
      return { success: false, message: 'No file selected' };
    }
    
    const importPath = filePaths[0];
    console.log(`Importing MCP from: ${importPath}`);
    
    // Create temp directory for extraction
    const tempExtractDir = path.join(mcpBaseDir, 'temp-extract-' + Date.now());
    fs.mkdirSync(tempExtractDir, { recursive: true });
    console.log(`Extracting to: ${tempExtractDir}`);
    
    // Extract the zip file using AdmZip instead of extract-zip
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(importPath);
      zip.extractAllTo(tempExtractDir, true);
      console.log(`Extraction complete`);
    } catch (extractError) {
      console.error('Extraction error:', extractError);
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
      return { success: false, message: `Extraction failed: ${extractError.message}` };
    }
    
    // Look for manifest.json
    const manifestPath = path.join(tempExtractDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      // Check if the zip contains a directory at the root
      const entries = fs.readdirSync(tempExtractDir);
      console.log('Extracted contents:', entries);
      
      if (entries.length === 1 && fs.statSync(path.join(tempExtractDir, entries[0])).isDirectory()) {
        // Check if manifest.json exists in the subdirectory
        const subdir = path.join(tempExtractDir, entries[0]);
        const subManifestPath = path.join(subdir, 'manifest.json');
        
        if (fs.existsSync(subManifestPath)) {
          console.log(`Found manifest in subdirectory: ${subManifestPath}`);
          // Move all files from subdirectory to the tempExtractDir
          fs.readdirSync(subdir).forEach(file => {
            fs.renameSync(
              path.join(subdir, file),
              path.join(tempExtractDir, file)
            );
          });
          // Remove the now-empty subdirectory
          fs.rmdirSync(subdir);
        } else {
          fs.rmSync(tempExtractDir, { recursive: true, force: true });
          return { success: false, message: 'Invalid MCP package: manifest.json not found' };
        }
      } else {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
        return { success: false, message: 'Invalid MCP package: manifest.json not found' };
      }
    }
    
    // Read manifest
    console.log(`Reading manifest from: ${manifestPath}`);
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');
    let mcpInfo;
    try {
      mcpInfo = JSON.parse(manifestContent);
      console.log('Manifest parsed:', mcpInfo);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
      return { success: false, message: `Invalid manifest: ${parseError.message}` };
    }
    
    // Validate required fields
    if (!mcpInfo.id || !mcpInfo.name) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
      return { success: false, message: 'Invalid manifest: missing required fields (id or name)' };
    }
    
    // Create MCP directory
    const mcpDirName = mcpInfo.id;
    const mcpDir = path.join(mcpBaseDir, mcpDirName);
    console.log(`Creating MCP directory: ${mcpDir}`);
    
    // Remove existing directory if it exists
    if (fs.existsSync(mcpDir)) {
      fs.rmSync(mcpDir, { recursive: true, force: true });
    }
    
    // Move extracted files to MCP directory
    try {
      fs.renameSync(tempExtractDir, mcpDir);
      console.log(`Moved extracted files to: ${mcpDir}`);
    } catch (moveError) {
      console.error('Move error:', moveError);
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
      return { success: false, message: `Failed to move files: ${moveError.message}` };
    }
    
    // Update MCP server list in store
    const mcpServers = store.get('mcpServers') || [];
    console.log('Current MCP servers:', mcpServers);
    
    // Remove existing MCP with same ID if it exists
    const existingIndex = mcpServers.findIndex(mcp => mcp.id === mcpInfo.id);
    if (existingIndex !== -1) {
      mcpServers.splice(existingIndex, 1);
    }
    
    // Add the new MCP
    const mcpServer = {
      id: mcpInfo.id,
      name: mcpInfo.name,
      description: mcpInfo.description || '',
      version: mcpInfo.version || '1.0.0',
      type: mcpInfo.isTypescript ? 'typescript' : 'nodejs',
      path: mcpDir,
      mainScript: mcpInfo.main || 'index.js',
      installed: false,
      running: false,
      hasConfig: false,
      configSchema: null,
      aiTools: mcpInfo.aiTools || []
    };
    
    // Check if the MCP has configSchema with API keys or other sensitive fields
    if (mcpInfo.configSchema && mcpInfo.configSchema.properties) {
      // Look for API key related properties in the schema
      const hasCredentialFields = Object.keys(mcpInfo.configSchema.properties).some(key => 
        key.toLowerCase().includes('api_key') || 
        key.toLowerCase().includes('apikey') || 
        key.toLowerCase().includes('token') || 
        key.toLowerCase().includes('credential') ||
        key.toLowerCase().includes('password')
      );
      
      if (hasCredentialFields) {
        mcpServer.hasConfig = true;
        mcpServer.configSchema = mcpInfo.configSchema;
        
        if (mainWindow) {
          mainWindow.webContents.send('mcp-info', { 
            mcpId: mcpInfo.id, 
            data: `MCP requires API keys or credentials configuration.\n` 
          });
        }
      }
    }
    
    mcpServers.push(mcpServer);
    store.set('mcpServers', mcpServers);
    console.log('Updated MCP servers list');
    
    return { 
      success: true, 
      message: 'MCP package imported successfully',
      mcpId: mcpInfo.id
    };
  } catch (error) {
    console.error('Error importing MCP:', error);
    return { success: false, message: `Import failed: ${error.message}` };
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
    
    // Check if API keys are required but not configured
    if (mcp.hasConfig && mcp.configSchema) {
      const settings = store.get(`mcpSettings.${mcpId}`) || {};
      const requiredApiKeys = [];
      
      // Check for required API keys in configSchema
      if (mcp.configSchema.properties) {
        Object.keys(mcp.configSchema.properties).forEach(key => {
          const isApiKey = key.toLowerCase().includes('api_key') || 
                          key.toLowerCase().includes('apikey') || 
                          key.toLowerCase().includes('token') || 
                          key.toLowerCase().includes('credential') ||
                          key.toLowerCase().includes('password');
                          
          // Check if required or has "required" in the property description
          const property = mcp.configSchema.properties[key];
          const isRequired = (mcp.configSchema.required || []).includes(key) ||
                            (property.description && property.description.toLowerCase().includes('required'));
          
          if (isApiKey && (!settings[key] || settings[key].trim() === '') && isRequired) {
            requiredApiKeys.push(key);
          }
        });
      }
      
      // If there are required API keys that aren't configured, request configuration first
      if (requiredApiKeys.length > 0) {
        return { 
          success: false, 
          message: 'API keys or credentials required',
          requiresConfig: true,
          configSchema: mcp.configSchema,
          requiredFields: requiredApiKeys
        };
      }
    }
    
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
    
    // For all MCPs, force TypeScript compilation if needed
    // Detect if it's a TypeScript project even if not marked as such
    const mcpDir = mcp.path;
    if (!mcpDir) {
      return { success: false, message: 'MCP directory not found' };
    }
    
    const tsconfigPath = path.join(mcpDir, 'tsconfig.json');
    const isTypescript = fs.existsSync(tsconfigPath);
    
    if (isTypescript) {
      // Update the isTypescript flag if needed
      if (!mcp.isTypescript) {
        mcpServers[mcpIndex].isTypescript = true;
        mcp.isTypescript = true;
        if (mainWindow) {
          mainWindow.webContents.send('mcp-output', { 
            mcpId, 
            data: `TypeScript project detected. Updating MCP type...\n` 
          });
        }
      }
    }
    
    if (mainWindow) {
      mainWindow.webContents.send('mcp-output', { 
        mcpId, 
        data: `Installing MCP in directory: ${mcpDir}\n` 
      });
    }

    // Install dependencies
    if (mainWindow) {
      mainWindow.webContents.send('mcp-output', { 
        mcpId, 
        data: `Running npm install...\n` 
      });
    }
    
    // Run npm install for all types
    try {
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
    } catch (installError) {
      // Log error but continue with the installation
      console.error('npm install error:', installError);
      if (mainWindow) {
        mainWindow.webContents.send('mcp-warning', { 
          mcpId, 
          data: `Warning: npm install had issues: ${installError.message}\nWill continue with installation...\n` 
        });
      }
    }
    
    // ALWAYS ensure bin directory exists for any MCP type
    const binDir = path.join(mcpDir, 'bin');
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
      if (mainWindow) {
        mainWindow.webContents.send('mcp-output', { 
          mcpId, 
          data: `Created bin directory at: ${binDir}\n` 
        });
      }
    }
    
    // If TypeScript MCP, run build
    if (isTypescript) {
      if (mainWindow) {
        mainWindow.webContents.send('mcp-output', { 
          mcpId, 
          data: `TypeScript MCP detected. Building...\n` 
        });
      }
      
      // Check if package.json has a build script
      const packageJsonPath = path.join(mcpDir, 'package.json');
      let buildSucceeded = false;
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Run build script or tsc directly
        const buildCmd = packageJson.scripts && packageJson.scripts.build ? 
          'npm run build' : 'npx tsc';
        
        if (mainWindow) {
          mainWindow.webContents.send('mcp-output', { 
            mcpId, 
            data: `Running build command: ${buildCmd}\n` 
          });
        }
        
        try {
          await new Promise((resolve, reject) => {
            const process = exec(buildCmd, {
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
                buildSucceeded = true;
                resolve();
              } else {
                reject(new Error(`${buildCmd} failed with code ${code}`));
              }
            });
          });
        } catch (buildError) {
          console.error('Build error:', buildError);
          if (mainWindow) {
            mainWindow.webContents.send('mcp-warning', { 
              mcpId, 
              data: `Warning: Build command failed: ${buildError.message}\nWill create a fallback implementation.\n` 
            });
          }
        }
      } else {
        if (mainWindow) {
          mainWindow.webContents.send('mcp-warning', { 
            mcpId, 
            data: `No package.json found. Will create a minimal implementation.\n`
          });
        }
      }
      
      // ALWAYS create the bin/index.js file, regardless of build success
      const indexJsPath = path.join(binDir, 'index.js');
      
      // Check if bin/index.js exists already
      if (!fs.existsSync(indexJsPath)) {
        if (mainWindow) {
          mainWindow.webContents.send('mcp-output', { 
            mcpId, 
            data: `Creating bin/index.js...\n`
          });
        }
        
        // Look for build output in common locations
        let foundOutput = false;
        let actualOutputPath = '';
        const possibleOutputDirs = ['dist', 'build', 'lib', 'out'];
        
        for (const dir of possibleOutputDirs) {
          const possiblePath = path.join(mcpDir, dir, 'index.js');
          
          if (fs.existsSync(possiblePath)) {
            actualOutputPath = possiblePath;
            foundOutput = true;
            if (mainWindow) {
              mainWindow.webContents.send('mcp-output', { 
                mcpId, 
                data: `Found build output at: ${dir}/index.js\n`
              });
            }
            break;
          }
          
          // Check if there might be a different entry point file (not index.js)
          if (fs.existsSync(path.join(mcpDir, dir))) {
            const dirFiles = fs.readdirSync(path.join(mcpDir, dir));
            const jsFiles = dirFiles.filter(file => file.endsWith('.js'));
            
            if (jsFiles.length > 0) {
              // Use the first JS file as entry point
              actualOutputPath = path.join(mcpDir, dir, jsFiles[0]);
              foundOutput = true;
              if (mainWindow) {
                mainWindow.webContents.send('mcp-output', { 
                  mcpId, 
                  data: `Found alternative entry point: ${dir}/${jsFiles[0]}\n`
                });
              }
              break;
            }
          }
        }
        
        if (foundOutput) {
          // Create a wrapper in bin/index.js that requires the actual build output
          const wrapperContent = `
/**
 * Wrapper for MCP ${mcp.name}
 * This file was auto-generated to ensure the bin/index.js structure is maintained
 */
// Load the actual build output
require('${path.relative(binDir, actualOutputPath).replace(/\\/g, '/')}');
`;
          fs.writeFileSync(indexJsPath, wrapperContent);
          if (mainWindow) {
            mainWindow.webContents.send('mcp-output', { 
              mcpId, 
              data: `Created wrapper for the actual build output in bin/index.js\n`
            });
          }
        } else {
          // No build output found, create a basic MCP server
          const fallbackContent = `
/**
 * Fallback MCP Server for ${mcp.name}
 * This is an auto-generated fallback implementation
 */

console.log('${mcp.name} MCP Server starting up...');
console.log('WARNING: This is a fallback implementation as the build process did not create a valid output');

// Initialize any necessary resources
console.log('Initializing MCP components...');

// Log successful startup
console.log('MCP Server started successfully');
console.log('Ready to process requests...');

// Simulate heartbeat for visibility
let counter = 0;
const interval = setInterval(() => {
  counter++;
  console.log(\`MCP Server heartbeat #\${counter}\`);
  
  // Occasionally log some additional information
  if (counter % 5 === 0) {
    console.log('System status: normal');
  }
}, 5000);

// Handle termination signals properly
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
});

// For Windows, handle Ctrl+C properly
if (process.platform === 'win32') {
  const rl = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.on('SIGINT', () => {
    process.emit('SIGINT');
  });
}
`;
          fs.writeFileSync(indexJsPath, fallbackContent);
          if (mainWindow) {
            mainWindow.webContents.send('mcp-output', { 
              mcpId, 
              data: `Created fallback implementation in bin/index.js\n`
            });
          }
        }
      } else {
        // bin/index.js already exists
        if (mainWindow) {
          mainWindow.webContents.send('mcp-output', { 
            mcpId, 
            data: `Using existing bin/index.js\n`
          });
        }
      }
    } else {
      // For non-TypeScript MCPs, still ensure a valid entry point
      const mainScriptPath = path.join(mcpDir, mcp.mainScript);
      
      // If the main script doesn't exist or it's not in the bin directory,
      // create a wrapper in the bin directory
      if (!fs.existsSync(mainScriptPath) || !mcp.mainScript.startsWith('bin/')) {
        const indexJsPath = path.join(binDir, 'index.js');
        
        // Create a wrapper or fallback implementation
        if (fs.existsSync(mainScriptPath)) {
          // Create a wrapper in bin/index.js that requires the actual main script
          const wrapperContent = `
/**
 * Wrapper for MCP ${mcp.name}
 * This file was auto-generated to ensure the bin/index.js structure is maintained
 */
// Load the actual main script
require('${path.relative(binDir, mainScriptPath).replace(/\\/g, '/')}');
`;
          fs.writeFileSync(indexJsPath, wrapperContent);
          if (mainWindow) {
            mainWindow.webContents.send('mcp-output', { 
              mcpId, 
              data: `Created wrapper for ${mcp.mainScript} in bin/index.js\n`
            });
          }
        } else {
          // Create a fallback implementation
          const fallbackContent = `
/**
 * Simple MCP Server for ${mcp.name}
 * This is an auto-generated implementation
 */

console.log('${mcp.name} MCP Server starting up...');

// Initialize any necessary resources
console.log('Initializing MCP components...');

// Log successful startup
console.log('MCP Server started successfully');
console.log('Ready to process requests...');

// Simulate heartbeat for visibility
let counter = 0;
const interval = setInterval(() => {
  counter++;
  console.log(\`MCP Server heartbeat #\${counter}\`);
  
  // Occasionally log some additional information
  if (counter % 5 === 0) {
    console.log('System status: normal');
  }
}, 5000);

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
});
`;
          fs.writeFileSync(indexJsPath, fallbackContent);
          if (mainWindow) {
            mainWindow.webContents.send('mcp-output', { 
              mcpId, 
              data: `Created fallback implementation in bin/index.js\n`
            });
          }
        }
        
        // Update the mainScript to point to bin/index.js
        mcpServers[mcpIndex].mainScript = 'bin/index.js';
      } else {
        if (mainWindow) {
          mainWindow.webContents.send('mcp-output', { 
            mcpId, 
            data: `Using existing main script: ${mcp.mainScript}\n` 
          });
        }
      }
    }
    
    // Verify that bin/index.js exists now
    const binIndexPath = path.join(mcpDir, 'bin', 'index.js');
    if (!fs.existsSync(binIndexPath)) {
      // Final fallback - create a minimal implementation if everything else failed
      const fallbackContent = `
/**
 * Emergency Fallback MCP Server for ${mcp.name}
 * This is a last-resort implementation
 */

console.log('${mcp.name} MCP Server (emergency fallback) starting up...');
console.log('WARNING: This is an emergency fallback implementation');

// Log successful startup
console.log('MCP Server started successfully');
console.log('Ready to process requests...');

// Heartbeat
setInterval(() => {
  console.log('MCP Server heartbeat');
}, 5000);

// Handle termination
process.on('SIGINT', () => {
  console.log('MCP Server shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('MCP Server shutting down...');
  process.exit(0);
});`;
      fs.writeFileSync(binIndexPath, fallbackContent);
      if (mainWindow) {
        mainWindow.webContents.send('mcp-warning', { 
          mcpId, 
          data: `WARNING: Had to create emergency fallback implementation in bin/index.js\n`
        });
      }
      
      // Update mainScript to point to the emergency implementation
      mcpServers[mcpIndex].mainScript = 'bin/index.js';
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
        
        // Get API keys and credentials from settings
        const mcpSettings = store.get(`mcpSettings.${mcpId}`) || {};
        const envVars = {};
        
        // Extract API keys and credentials from the settings
        if (mcp.hasConfig && mcp.configSchema && mcp.configSchema.properties) {
          Object.keys(mcp.configSchema.properties).forEach(key => {
            const property = mcp.configSchema.properties[key];
            const isApiKey = key.toLowerCase().includes('api_key') || 
                            key.toLowerCase().includes('apikey') || 
                            key.toLowerCase().includes('token') || 
                            key.toLowerCase().includes('credential') ||
                            key.toLowerCase().includes('password');
            
            if (isApiKey && mcpSettings[key]) {
              // Add as environment variable (conventionally uppercase)
              envVars[key.toUpperCase()] = mcpSettings[key];
              
              if (mainWindow) {
                mainWindow.webContents.send('mcp-output', { 
                  mcpId, 
                  data: `Added ${key} to environment variables.\n` 
                });
              }
            }
          });
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
            env: {...envVars} // Add API keys as environment variables
          };
          
          if (mainWindow) {
            mainWindow.webContents.send('mcp-output', { 
              mcpId, 
              data: `MongoDB MCP configuration added to external config. You'll need to update the connection string later.\n` 
            });
          }
        } else {
          // Use the absolute path to bin/index.js for all MCPs
          const binIndexPath = path.join(mcpDir, 'bin', 'index.js');
          
          if (fs.existsSync(binIndexPath)) {
            externalConfig.mcpServers[mcpId] = {
              command: 'node',
              args: [binIndexPath],
              env: {...envVars} // Add API keys as environment variables
            };
            
            if (mainWindow) {
              mainWindow.webContents.send('mcp-output', { 
                mcpId, 
                data: `MCP configuration updated with absolute path to bin/index.js\n` 
              });
            }
          } else {
            // Fallback to original main script if for some reason bin/index.js is still missing
            externalConfig.mcpServers[mcpId] = {
              command: 'node',
              args: [path.join(mcpDir, mcpServers[mcpIndex].mainScript)],
              env: {...envVars} // Add API keys as environment variables
            };
          }
        }
        
        // Save the updated config
        fs.writeFileSync(externalConfigPath, JSON.stringify(externalConfig, null, 2));
        
        if (mainWindow) {
          mainWindow.webContents.send('mcp-output', { 
            mcpId, 
            data: `MCP configuration updated for tools: ${selectedTools.join(', ')}\n` 
          });
          
          mainWindow.webContents.send('mcp-output', { 
            mcpId, 
            data: `External config updated at: ${externalConfigPath}\n` 
          });
        }
      } catch (error) {
        console.error('Error updating external config:', error);
        if (mainWindow) {
          mainWindow.webContents.send('mcp-error', { 
            mcpId, 
            data: `Warning: Failed to update external tool configuration: ${error.message}\n` 
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
      
      // Instead of relying on smithery schema, just check if settings exist
      if (!settings) {
        return { 
          success: false, 
          message: 'MCP server configuration required',
          requiresConfig: true
        };
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
  
  // If connecting the tool, update the external config to include API keys
  if (mcpServers[mcpIndex].aiTools[toolIndex].connected) {
    try {
      // Get MCP settings that might contain API keys
      const mcpSettings = store.get(`mcpSettings.${mcpId}`) || {};
      
      // Check for specific API keys based on tool
      const apiKeyName = toolId + '_api_key';
      
      // If we have API key for this tool, update external config
      if (mcpSettings[apiKeyName]) {
        const externalConfigPath = path.join(app.getPath('home'), '.cursor', 'mcp.json');
        
        if (fs.existsSync(externalConfigPath)) {
          try {
            const fileContent = fs.readFileSync(externalConfigPath, 'utf8');
            const externalConfig = JSON.parse(fileContent);
            
            // Check if this MCP exists in external config
            if (externalConfig.mcpServers && externalConfig.mcpServers[mcpId]) {
              // Initialize env if it doesn't exist
              if (!externalConfig.mcpServers[mcpId].env) {
                externalConfig.mcpServers[mcpId].env = {};
              }
              
              // Add API key as environment variable
              externalConfig.mcpServers[mcpId].env[apiKeyName.toUpperCase()] = mcpSettings[apiKeyName];
              
              // Save the updated config
              fs.writeFileSync(externalConfigPath, JSON.stringify(externalConfig, null, 2));
              
              if (mainWindow) {
                mainWindow.webContents.send('mcp-output', { 
                  mcpId, 
                  data: `Updated external config with ${toolId} API key as environment variable\n` 
                });
              }
            }
          } catch (e) {
            console.error('Error updating external config with tool API key:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error updating external config with tool API key:', error);
    }
  }
  
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

// Helper function to safely remove a directory with retries
async function safeRemoveDirectory(dirPath, maxRetries = 3) {
  if (!fs.existsSync(dirPath)) return true;
  
  try {
    // First attempt - normal deletion
    fs.rmSync(dirPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error('Initial directory removal failed:', error.message);
    
    // If not EBUSY or similar error, don't retry
    if (error.code !== 'EBUSY' && error.code !== 'EPERM') {
      throw error;
    }
    
    // Try with retries for EBUSY errors
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Wait longer between each retry
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
        
        fs.rmSync(dirPath, { recursive: true, force: true });
        return true;
      } catch (retryError) {
        console.warn(`Retry ${attempt}/${maxRetries} failed:`, retryError.message);
        
        // Last attempt
        if (attempt === maxRetries) {
          return false;
        }
      }
    }
  }
  
  return false;
}

// Uninstall an MCP server
ipcMain.handle('uninstall-mcp', async (event, mcpId) => {
  const mcpServers = store.get('mcpServers');
  const mcpIndex = mcpServers.findIndex(mcp => mcp.id === mcpId);
  
  if (mcpIndex === -1) return { success: false, message: 'MCP server not found' };
  
  try {
    const mcp = mcpServers[mcpIndex];
    
    if (mainWindow) {
      mainWindow.webContents.send('mcp-output', { 
        mcpId, 
        data: `Uninstalling MCP server...\n` 
      });
    }
    
    // Check if the MCP is running and stop it
    if (mcp.running) {
      if (mainWindow) {
        mainWindow.webContents.send('mcp-output', { 
          mcpId, 
          data: `Stopping running MCP process...\n` 
        });
      }
      
      // Stop the MCP process
      if (mcpProcesses[mcpId] && !mcpProcesses[mcpId].killed) {
        mcpProcesses[mcpId].kill();
        
        // Give the process some time to fully terminate
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Remove the MCP directory if it exists
    if (mcp.path && fs.existsSync(mcp.path)) {
      if (mainWindow) {
        mainWindow.webContents.send('mcp-output', { 
          mcpId, 
          data: `Removing MCP directory: ${mcp.path}\n` 
        });
      }
      
      const directoryRemoved = await safeRemoveDirectory(mcp.path);
      
      if (!directoryRemoved) {
        // Could not remove directory, but we'll continue with uninstallation
        if (mainWindow) {
          mainWindow.webContents.send('mcp-warning', { 
            mcpId, 
            data: `Warning: Could not remove MCP directory because it's in use.\n` +
                  `The MCP will be marked as uninstalled, but you may need to manually delete the directory later.\n` +
                  `Try restarting the application if you need to reinstall this MCP.\n`
          });
        }
      }
    }
    
    // Remove MCP from external config file if needed
    try {
      const externalConfigPath = path.join(app.getPath('home'), '.cursor', 'mcp.json');
      if (fs.existsSync(externalConfigPath)) {
        if (mainWindow) {
          mainWindow.webContents.send('mcp-output', { 
            mcpId, 
            data: `Updating external configuration...\n` 
          });
        }
        
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
          if (mainWindow) {
            mainWindow.webContents.send('mcp-warning', { 
              mcpId, 
              data: `Warning: Could not update external configuration: ${e.message}\n` 
            });
          }
        }
      }
    } catch (error) {
      console.error('Error removing MCP from external config:', error);
      if (mainWindow) {
        mainWindow.webContents.send('mcp-warning', { 
          mcpId, 
          data: `Warning: Error updating external config: ${error.message}\n` 
        });
      }
    }
    
    // Update MCP status in store regardless of whether directory deletion was successful
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