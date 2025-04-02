// DOM Elements
const mcpServerList = document.getElementById('mcpServerList');
const serverDetail = document.getElementById('serverDetail');
const detailTitle = document.getElementById('detailTitle');
const importButton = document.getElementById('importButton');
const installButton = document.getElementById('installButton');
const uninstallButton = document.getElementById('uninstallButton');
const settingsButton = document.getElementById('settingsButton');
const mcpType = document.getElementById('mcpType');
const mcpVersion = document.getElementById('mcpVersion');
const aiToolsList = document.getElementById('aiToolsList');
const consoleOutput = document.getElementById('consoleOutput');
const credentialModal = document.getElementById('credentialModal');
const closeModalButton = document.querySelector('.close-button');
const saveCredentialButton = document.getElementById('saveCredentialButton');
const cancelCredentialButton = document.getElementById('cancelCredentialButton');
const apiKeyInput = document.getElementById('apiKeyInput');
const credentialMessage = document.getElementById('credentialMessage');

// Environment Variables Elements
const envVariablesInfo = document.getElementById('envVariablesInfo');
const envVariablesList = document.getElementById('envVariablesList');
const envActions = document.getElementById('envActions');
const saveEnvButton = document.getElementById('saveEnvButton');

// Settings Modal Elements
const settingsModal = document.getElementById('settingsModal');
const closeSettingsButton = document.querySelector('.close-settings-button');
const saveSettingsButton = document.getElementById('saveSettingsButton');
const cancelSettingsButton = document.getElementById('cancelSettingsButton');
const settingsForm = document.getElementById('settingsForm');

// Tool Selection Modal Elements (to be added to HTML)
const toolSelectionModal = document.createElement('div');
toolSelectionModal.id = 'toolSelectionModal';
toolSelectionModal.className = 'modal hidden';
toolSelectionModal.innerHTML = `
  <div class="modal-content">
    <div class="modal-header">
      <h3>Select Tools for Integration</h3>
      <span class="close-tool-selection-button close-button">&times;</span>
    </div>
    <div class="modal-body">
      <p>Select which tools you want to integrate this MCP with:</p>
      <div id="toolSelectionList" class="tool-selection-list">
        <div class="tool-option">
          <input type="checkbox" id="tool-claude" value="claude" checked>
          <label for="tool-claude">Claude</label>
        </div>
        <div class="tool-option">
          <input type="checkbox" id="tool-cursor" value="cursor" checked>
          <label for="tool-cursor">Cursor</label>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button id="proceedInstallButton" class="action-button">Install</button>
      <button id="cancelToolSelectionButton" class="cancel-button">Cancel</button>
    </div>
  </div>
`;

// State variables
let currentMcpId = null;
let currentToolId = null;
let mcpServers = [];
let currentSettings = {};

// Initialize the application
async function initApp() {
  try {
    // Check if API is available
    if (!window.api) {
      console.error('API not available. ContextBridge may not be set up correctly.');
      document.body.innerHTML = '<div style="padding: 2rem; color: red;">Error: API not available. Please restart the application.</div>';
      return;
    }

    // Add tool selection modal to the document
    document.body.appendChild(toolSelectionModal);
    
    // Get references to tool selection modal buttons
    const closeToolSelectionButton = document.querySelector('.close-tool-selection-button');
    const proceedInstallButton = document.getElementById('proceedInstallButton');
    const cancelToolSelectionButton = document.getElementById('cancelToolSelectionButton');
    
    // Add event listeners for tool selection modal
    closeToolSelectionButton.addEventListener('click', hideToolSelectionModal);
    proceedInstallButton.addEventListener('click', proceedWithInstallation);
    cancelToolSelectionButton.addEventListener('click', hideToolSelectionModal);
    
    // Load MCP servers from the main process
    mcpServers = await window.api.getMcpServers();
    renderMcpServerList();
    
    // Set up event listeners
    setupEventListeners();
  } catch (error) {
    console.error('Error initializing app:', error);
    addConsoleMessage(`Error initializing app: ${error.message}`, true);
  }
}

// Render the MCP server list
function renderMcpServerList() {
  // Clear the current list
  mcpServerList.innerHTML = '';
  
  // If no MCP servers, show a message and add a default one
  if (mcpServers.length === 0) {
    addConsoleMessage('No MCP servers found, creating a default one', false);
    // Create a default MCP server directly in the renderer
    const defaultMcp = {
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
    };
    mcpServers.push(defaultMcp);
  }
  
  // Create an element for each MCP server
  mcpServers.forEach(mcp => {
    const serverElement = document.createElement('div');
    serverElement.className = 'server-item';
    serverElement.dataset.mcpId = mcp.id;
    
    // Add active class if this is the current selected server
    if (mcp.id === currentMcpId) {
      serverElement.classList.add('active');
    }
    
    // Create the server status element
    let statusClass = 'status-not-installed';
    let statusText = 'Not Installed';
    
    if (mcp.installed) {
      statusClass = 'status-installed';
      statusText = 'Installed';
    }
    
    // Set the server item content
    serverElement.innerHTML = `
      <h3>${mcp.name}</h3>
      <p>${mcp.description}</p>
      <span class="server-status ${statusClass}">${statusText}</span>
    `;
    
    // Add click handler to select this server
    serverElement.addEventListener('click', () => {
      selectMcpServer(mcp.id);
    });
    
    mcpServerList.appendChild(serverElement);
  });
}

// Select an MCP server and show its details
async function selectMcpServer(mcpId) {
  // Update the current MCP ID
  currentMcpId = mcpId;
  
  // Update the server list UI to show the active server
  document.querySelectorAll('.server-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.mcpId === mcpId) {
      item.classList.add('active');
    }
  });
  
  // Find the selected MCP server
  const selectedMcp = mcpServers.find(mcp => mcp.id === mcpId);
  if (!selectedMcp) return;
  
  // Update the detail view
  detailTitle.textContent = selectedMcp.name;
  
  // Update MCP info
  mcpType.textContent = selectedMcp.type || 'Simple';
  mcpVersion.textContent = selectedMcp.version || '1.0.0';
  
  // Show/hide settings button based on whether the MCP has configuration
  settingsButton.style.display = selectedMcp.hasConfig ? 'flex' : 'none';
  
  // Load current settings if available
  if (selectedMcp.hasConfig) {
    currentSettings = await window.api.getMcpSettings(mcpId);
  } else {
    currentSettings = {};
  }
  
  // Update button states - but don't let this override env var validation
  // We'll set basic button state here but let env var validation take precedence
  updateButtonStates(selectedMcp);
  
  // Initially disable the install button until validation completes, but only if the MCP has environment variables
  if (selectedMcp.hasConfig && selectedMcp.configSchema && 
      selectedMcp.configSchema.properties && 
      Object.keys(selectedMcp.configSchema.properties).length > 0) {
    installButton.disabled = true;
  } else {
    // For MCPs with no env vars, set button state based on installation status
    installButton.disabled = selectedMcp.installed;
  }
  
  // Render environment variables first so they can control install button state
  renderEnvironmentVariables(selectedMcp);
  
  // Render AI tools
  renderAiTools(selectedMcp);
  
  // Clear console output
  consoleOutput.innerHTML = '';
  
  // Show the detail panel
  serverDetail.classList.remove('hidden');
  
  // Force validation to ensure install button is in correct state
  setTimeout(() => checkEnvVarsAndUpdateInstallButton(selectedMcp), 100);
}

// Update the button states based on the MCP server state
function updateButtonStates(mcp) {
  if (!mcp) return;
  
  // First check if environment variables need to be filled - but don't run this function
  // if we're in the process of showing environment variables
  const form = document.getElementById('envVariablesForm');
  if (form && mcp.hasConfig && mcp.configSchema && mcp.configSchema.required && mcp.configSchema.required.length > 0) {
    // We're already showing environment variables, let checkEnvVarsAndUpdateInstallButton handle this
    // Just set states for other buttons
    
    // Hide/show uninstall button based on installation status
    uninstallButton.style.display = mcp.installed ? 'inline-block' : 'none';
    // Disable uninstall button if the server is running
    uninstallButton.disabled = mcp.running;
    return;
  }
  
  // Normal button states
  installButton.disabled = mcp.installed;
  installButton.title = mcp.installed ? 'MCP is already installed' : 'Install this MCP';
  
  // Hide/show uninstall button based on installation status
  uninstallButton.style.display = mcp.installed ? 'inline-block' : 'none';
  // Disable uninstall button if the server is running
  uninstallButton.disabled = mcp.running;
}

// Render the AI tools list
function renderAiTools(mcp) {
  // Hide AI tools section completely
  aiToolsList.innerHTML = '';
  aiToolsList.style.display = 'none';
  
  // Hide the heading/label for the AI tools section if it exists
  const aiToolsHeader = document.querySelector('.ai-tools-header') || document.querySelector('h4');
  if (aiToolsHeader && aiToolsHeader.textContent.includes('AI Tools')) {
    aiToolsHeader.style.display = 'none';
  }
}

// Toggle an AI tool connection
async function toggleAiTool(mcpId, toolId) {
  // If trying to enable a tool, check if API keys are required
  const mcp = mcpServers.find(mcp => mcp.id === mcpId);
  const tool = mcp.aiTools.find(tool => tool.id === toolId);
  
  // Don't check if we're disconnecting
  if (tool.connected) {
    const result = await window.api.toggleAiTool(mcpId, toolId);
    await refreshMcpServers();
    return;
  }
  
  // For Claude and Cursor, we need to check for API keys
  if (toolId === 'claude' || toolId === 'cursor') {
    // Check if we already have the API key in the settings
    const settings = await window.api.getMcpSettings(mcpId) || {};
    let apiKeyName = toolId + '_api_key';
    
    if (!settings[apiKeyName] || settings[apiKeyName].trim() === '') {
      // Show the credential modal for this tool
      showToolCredentialModal(toolId, mcpId);
      return;
    }
  }
  
  // If we have the API key or it's not required, proceed with toggle
  const result = await window.api.toggleAiTool(mcpId, toolId);
  
  // If credentials are required for other reasons, show the modal
  if (!result.success && result.requiresCredentials) {
    showCredentialModal(toolId);
    return;
  }
  
  // Refresh MCP servers and update UI
  await refreshMcpServers();
}

// Show credential modal specifically for tool API keys
function showToolCredentialModal(toolId, mcpId) {
  currentToolId = toolId;
  currentMcpId = mcpId;
  
  // Find the tool name
  const mcp = mcpServers.find(mcp => mcp.id === mcpId);
  const tool = mcp.aiTools.find(tool => tool.id === toolId);
  
  // Clear previous value
  apiKeyInput.value = '';
  
  // Update the message to be more specific for tool connections
  if (toolId === 'claude') {
    credentialMessage.innerHTML = `
      <strong>Claude API Key Required</strong><br>
      Please enter your Claude API key to connect to this tool.<br>
      <small>This will be saved and used as an environment variable for this MCP.</small>
    `;
  } else if (toolId === 'cursor') {
    credentialMessage.innerHTML = `
      <strong>Cursor API Key Required</strong><br>
      Please enter your Cursor API key to connect to this tool.<br>
      <small>This will be saved and used as an environment variable for this MCP.</small>
    `;
  } else {
    credentialMessage.textContent = `Please enter your API credentials for ${tool.name}:`;
  }
  
  // Show the modal
  credentialModal.classList.remove('hidden');
}

// Hide the credential modal
function hideCredentialModal() {
  credentialModal.classList.add('hidden');
  currentToolId = null;
}

// Save credentials and try to connect again - modified for tool API keys
async function saveCredentials() {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    // Show error message
    alert('Please enter a valid API key');
    return;
  }
  
  // Save the credentials to the MCP settings
  const settings = await window.api.getMcpSettings(currentMcpId) || {};
  
  // For Claude and Cursor, use a specific naming pattern
  if (currentToolId === 'claude' || currentToolId === 'cursor') {
    const apiKeyName = currentToolId + '_api_key';
    settings[apiKeyName] = apiKey;
    
    // Save to MCP settings
    await window.api.saveMcpSettings(currentMcpId, settings);
    
    addConsoleMessage(`${currentToolId.charAt(0).toUpperCase() + currentToolId.slice(1)} API key added to environment variables.`);
  }
  
  // Also save as credential for the tool
  await window.api.saveCredentials(currentToolId, { apiKey });
  
  // Try to toggle the AI tool again
  await toggleAiTool(currentMcpId, currentToolId);
  
  // Hide the modal
  hideCredentialModal();
}

// Show the settings modal
function showSettingsModal() {
  if (!currentMcpId) return;
  
  // Find the selected MCP server
  const selectedMcp = mcpServers.find(mcp => mcp.id === currentMcpId);
  if (!selectedMcp || !selectedMcp.hasConfig) return;
  
  // Clear the form
  settingsForm.innerHTML = '';
  
  // Build the form based on the config schema
  if (selectedMcp.configSchema) {
    const schema = selectedMcp.configSchema;
    const properties = schema.properties || {};
    
    Object.keys(properties).forEach(key => {
      const property = properties[key];
      const value = currentSettings[key] || '';
      const required = schema.required && schema.required.includes(key);
      
      // Create form group
      const formGroup = document.createElement('div');
      formGroup.className = 'form-group';
      
      // Create label
      const label = document.createElement('label');
      label.htmlFor = `setting-${key}`;
      
      // Highlight API keys and required fields
      const isApiKey = key.toLowerCase().includes('api_key') || 
                      key.toLowerCase().includes('apikey') || 
                      key.toLowerCase().includes('token') || 
                      key.toLowerCase().includes('credential') ||
                      key.toLowerCase().includes('password');
                      
      // Add visual indicator for API keys
      if (isApiKey) {
        label.textContent = `${property.title || key}${required ? ' *' : ''} 🔑:`;
        label.className = 'api-key-label'; // Add a class for styling
      } else {
        label.textContent = `${property.title || key}${required ? ' *' : ''}:`;
      }
      
      // Create input with proper type for credentials
      const input = document.createElement('input');
      
      // Use password type for API keys and credentials
      if (isApiKey) {
        input.type = 'password';
        input.className = 'form-control api-key-input'; // Add a class for styling
      } else {
        input.type = property.format === 'password' ? 'password' : 'text';
        input.className = 'form-control';
      }
      
      input.id = `setting-${key}`;
      input.name = key;
      input.value = value;
      input.required = required;
      
      // Create help text if available
      let helpText = null;
      if (property.description) {
        helpText = document.createElement('span');
        helpText.className = 'form-control-help';
        
        // Add additional instructions for API keys
        if (isApiKey) {
          helpText.innerHTML = `${property.description} <br><em>Will be set as an environment variable for the MCP.</em>`;
          helpText.className = 'form-control-help api-key-help';
        } else {
          helpText.textContent = property.description;
        }
      }
      
      // Append elements to the form group
      formGroup.appendChild(label);
      formGroup.appendChild(input);
      if (helpText) {
        formGroup.appendChild(helpText);
      }
      
      settingsForm.appendChild(formGroup);
    });
  }
  // Show the modal
  settingsModal.classList.remove('hidden');
}

// Hide the settings modal
function hideSettingsModal() {
  settingsModal.classList.add('hidden');
}

// Save settings
async function saveSettings() {
  // Collect form data
  const formData = {};
  const inputs = settingsForm.querySelectorAll('input');
  
  let isValid = true;
  inputs.forEach(input => {
    if (input.required && !input.value.trim()) {
      isValid = false;
      input.classList.add('invalid');
    } else {
      input.classList.remove('invalid');
      formData[input.name] = input.value.trim();
    }
  });
  
  if (!isValid) {
    alert('Please fill in all required fields');
    return;
  }
  
  // Save the settings
  await window.api.saveMcpSettings(currentMcpId, formData);
  currentSettings = formData;
  
  // Hide the modal
  hideSettingsModal();
  
  // Show success message
  addConsoleMessage('Settings saved successfully');
}

// Import an MCP package
async function importMcpPackage() {
  try {
    addConsoleMessage('Importing MCP package...');
    
    // Show a loading indicator in the MCP server list
    const loadingElement = document.createElement('div');
    loadingElement.className = 'loading';
    loadingElement.textContent = 'Importing MCP package...';
    mcpServerList.appendChild(loadingElement);
    
    // Call the import function
    const result = await window.api.importMcp();
    
    // Remove the loading indicator
    mcpServerList.removeChild(loadingElement);
    
    if (result.success) {
      // Add import message to console
      addConsoleMessage('MCP package imported successfully');
      
      // Refresh the MCP servers list
      await refreshMcpServers();
      
      // Select the newly imported MCP
      if (result.mcpId) {
        selectMcpServer(result.mcpId);
        
        // Get the MCP details to check if it needs environment variables
        const importedMcp = mcpServers.find(mcp => mcp.id === result.mcpId);
        const needsEnvVars = importedMcp && importedMcp.hasConfig && 
                            importedMcp.configSchema && 
                            importedMcp.configSchema.properties && 
                            Object.keys(importedMcp.configSchema.properties).length > 0;
        
        if (needsEnvVars) {
          addConsoleMessage(`
MCP package imported: ${result.mcpId}
This MCP requires environment variables. Please configure them above before installing.
To install this MCP:
1. Fill in the required environment variables and click "Save Environment Variables"
2. Click the Install button to install dependencies and configure the MCP
3. The external configuration at C:\\Users\\<username>\\.cursor\\mcp.json will be updated
`);
        } else {
          addConsoleMessage(`
MCP package imported: ${result.mcpId}
To install this MCP, click the Install button. This will:
1. Install any dependencies
2. Configure the MCP for use with the selected AI tools
3. Update the external configuration at C:\\Users\\<username>\\.cursor\\mcp.json
`);
        }
      }
    } else {
      // Show error message
      addConsoleMessage(`Import failed: ${result.message}`, true);
    }
  } catch (error) {
    console.error('Error importing MCP package:', error);
    addConsoleMessage(`Error importing MCP package: ${error.message}`, true);
  }
}

// Install an MCP server
async function installMcpServer() {
  if (!currentMcpId) return;
  
  // Check if all required environment variables are filled
  const selectedMcp = mcpServers.find(mcp => mcp.id === currentMcpId);
  
  // Only check required fields if the MCP has a config schema with required fields
  if (selectedMcp.hasConfig && 
      selectedMcp.configSchema && 
      selectedMcp.configSchema.required && 
      selectedMcp.configSchema.required.length > 0) {
    
    const requiredFields = selectedMcp.configSchema.required;
    const settings = currentSettings || {};
    
    let missingFields = [];
    
    // Check only explicitly required fields from schema
    requiredFields.forEach(field => {
      if (!settings[field] || settings[field].trim() === '') {
        missingFields.push(field);
      }
    });
    
    if (missingFields.length > 0) {
      addConsoleMessage(`Cannot install: Missing required environment variables: ${missingFields.join(', ')}`, true);
      addConsoleMessage('Please fill in all required environment variables and save them before installing.', true);
      return;
    }
  }
  
  // Show tool selection modal
  showToolSelectionModal();
}

// Proceed with installation after tool selection
async function proceedWithInstallation() {
  // Get selected tools
  const selectedTools = getSelectedTools();
  
  // Hide the tool selection modal
  hideToolSelectionModal();
  
  // Disable the install button during installation
  installButton.disabled = true;
  
  // Install the MCP server
  addConsoleMessage('Installing MCP server...');
  addConsoleMessage(`Selected tools for integration: ${selectedTools.join(', ')}`);
  
  const result = await window.api.installMcp(currentMcpId, selectedTools);
  
  if (result.success) {
    // Add installation message to console
    addConsoleMessage('MCP server installed successfully');
    
    // Refresh MCP servers and update UI
    await refreshMcpServers();
  } else {
    // Show error message
    addConsoleMessage(`Installation failed: ${result.message}`, true);
    installButton.disabled = false;
  }
}

// Uninstall an MCP server
async function uninstallMcpServer() {
  if (!currentMcpId) return;
  
  // Confirm uninstallation with the user
  if (!confirm(`Are you sure you want to uninstall ${detailTitle.textContent}? This will remove all associated environment variables and settings.`)) {
    return;
  }
  
  // Disable the uninstall button during uninstallation
  uninstallButton.disabled = true;
  
  // Uninstall the MCP server
  addConsoleMessage('Uninstalling MCP server...');
  
  const result = await window.api.uninstallMcp(currentMcpId);
  
  if (result.success) {
    // Add uninstallation message to console
    addConsoleMessage('MCP server uninstalled successfully');
    
    // Clear environment variables and settings for this MCP
    try {
      await window.api.saveMcpSettings(currentMcpId, {});
      currentSettings = {};
      addConsoleMessage('Environment variables and settings removed');
    } catch (error) {
      addConsoleMessage(`Warning: Could not clear environment variables: ${error.message}`, true);
    }
    
    // Clear environment variables UI
    if (envVariablesList) {
      envVariablesList.innerHTML = '';
    }
    if (envVariablesInfo) {
      envVariablesInfo.innerHTML = '<div class="info-message">MCP has been uninstalled. Environment variables were cleared.</div>';
    }
    
    // Refresh MCP servers and update UI
    await refreshMcpServers();
  } else {
    // Show error message
    addConsoleMessage(`Uninstallation failed: ${result.message}`, true);
    uninstallButton.disabled = false;
  }
}

// Add a message to the console output
function addConsoleMessage(message, isError = false) {
  const messageElement = document.createElement('div');
  messageElement.className = isError ? 'console-error' : 'console-message';
  messageElement.textContent = message;
  
  consoleOutput.appendChild(messageElement);
  
  // Scroll to the bottom of the console
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// Refresh the MCP servers data
async function refreshMcpServers() {
  mcpServers = await window.api.getMcpServers();
  renderMcpServerList();
  
  // If a server is selected, update its details
  if (currentMcpId) {
    const selectedMcp = mcpServers.find(mcp => mcp.id === currentMcpId);
    if (selectedMcp) {
      updateButtonStates(selectedMcp);
      renderAiTools(selectedMcp);
      renderEnvironmentVariables(selectedMcp);
    }
  }
}

// Set up event listeners
function setupEventListeners() {
  // Button click handlers
  importButton.addEventListener('click', importMcpPackage);
  
  // Replace the standard click handler with one that double-checks environment variables
  installButton.addEventListener('click', function(event) {
    // First validate environment variables
    const selectedMcp = mcpServers.find(mcp => mcp.id === currentMcpId);
    
    // Skip validation if no MCP is selected
    if (!selectedMcp) return;
    
    // Double check required environment variables
    if (selectedMcp.hasConfig && selectedMcp.configSchema && selectedMcp.configSchema.properties) {
      const form = document.getElementById('envVariablesForm');
      
      // If we have a form with environment variables, verify they're all filled
      if (form) {
        checkEnvVarsAndUpdateInstallButton(selectedMcp);
        
        // If the button is disabled after validation, stop here
        if (installButton.disabled) {
          event.preventDefault();
          event.stopPropagation();
          
          // Simple message in console instead of flashing alert
          addConsoleMessage("Please save your environment variables before installing", false);
          return;
        }
      }
    }
    
    // If validation passes, proceed with installation
    installMcpServer();
  });
  
  uninstallButton.addEventListener('click', uninstallMcpServer);
  settingsButton.addEventListener('click', showSettingsModal);
  saveEnvButton.addEventListener('click', saveEnvironmentVariables);
  
  // Credential modal button handlers
  closeModalButton.addEventListener('click', hideCredentialModal);
  saveCredentialButton.addEventListener('click', saveCredentials);
  cancelCredentialButton.addEventListener('click', hideCredentialModal);
  
  // Settings modal button handlers
  closeSettingsButton.addEventListener('click', hideSettingsModal);
  saveSettingsButton.addEventListener('click', saveSettings);
  cancelSettingsButton.addEventListener('click', hideSettingsModal);
  
  // MCP output handler
  window.api.onMcpOutput((data) => {
    if (data.mcpId === currentMcpId) {
      addConsoleMessage(data.data);
    }
  });
  
  // MCP error handler
  window.api.onMcpError((data) => {
    if (data.mcpId === currentMcpId) {
      addConsoleMessage(data.data, true);
    }
  });
  
  // MCP stopped handler
  window.api.onMcpStopped(async (data) => {
    if (data.mcpId === currentMcpId) {
      addConsoleMessage(`MCP server stopped with code ${data.code}`);
      
      // Refresh MCP servers and update UI
      await refreshMcpServers();
    }
  });
}

// Show the tool selection modal
function showToolSelectionModal() {
  toolSelectionModal.classList.remove('hidden');
}

// Hide the tool selection modal
function hideToolSelectionModal() {
  toolSelectionModal.classList.add('hidden');
}

// Get selected tools from the tool selection modal
function getSelectedTools() {
  const selectedTools = [];
  const checkboxes = document.querySelectorAll('#toolSelectionList input[type="checkbox"]:checked');
  checkboxes.forEach(checkbox => {
    selectedTools.push(checkbox.value);
  });
  return selectedTools;
}

// Show the credential input modal for general credentials
function showCredentialModal(toolId) {
  currentToolId = toolId;
  
  // Find the tool name
  const mcp = mcpServers.find(mcp => mcp.id === currentMcpId);
  const tool = mcp.aiTools.find(tool => tool.id === toolId);
  
  credentialMessage.textContent = `Please enter your API credentials for ${tool.name}:`;
  apiKeyInput.value = '';
  
  credentialModal.classList.remove('hidden');
}

// Render the environment variables from the manifest
function renderEnvironmentVariables(mcp) {
  // Clear the current list
  envVariablesList.innerHTML = '';
  envVariablesInfo.innerHTML = '';
  envActions.style.display = 'none';
  
  // If the MCP server has no config or no properties, enable the install button
  if (!mcp.configSchema || !mcp.configSchema.properties || Object.keys(mcp.configSchema.properties).length === 0) {
    envVariablesInfo.innerHTML = '<div class="info-message">No environment variables required for this MCP.</div>';
    // Enable the install button immediately if not installed
    if (mcp && !mcp.installed) {
      installButton.disabled = false;
      installButton.title = 'Install this MCP';
    }
    return;
  }
  
  const schema = mcp.configSchema;
  const properties = schema.properties || {};
  
  // Check if there are any properties that look like environment variables
  const envVarKeys = Object.keys(properties).filter(key => 
    key.toLowerCase().includes('api_key') || 
    key.toLowerCase().includes('apikey') || 
    key.toLowerCase().includes('token') || 
    key.toLowerCase().includes('secret') ||
    key.toLowerCase().includes('password') ||
    key.toLowerCase().includes('credential') ||
    key.toLowerCase().includes('env_') ||
    key.toLowerCase().includes('environment')
  );
  
  if (envVarKeys.length === 0) {
    envVariablesInfo.innerHTML = '<div class="info-message">No environment variables identified in the MCP configuration.</div>';
    return;
  }
  
  // Get current settings
  const settings = currentSettings || {};
  
  // Show info about environment variables
  envVariablesInfo.innerHTML = '<div class="info-message">This MCP requires environment variables. Please configure them before installation.</div>';
  
  // Create a form for environment variables
  const form = document.createElement('form');
  form.id = 'envVariablesForm';
  form.className = 'env-form';
  
  // Create inputs for each environment variable
  envVarKeys.forEach(key => {
    const property = properties[key];
    const value = settings[key] || '';
    
    // Only consider fields as required if explicitly marked in the schema
    const required = schema.required && schema.required.includes(key);
    
    // Create form group
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    // Create label
    const label = document.createElement('label');
    label.htmlFor = `env-${key}`;
    label.className = required ? 'env-label required-field' : 'env-label';
    label.textContent = `${property.title || key}${required ? ' *' : ''}:`;
    
    // Create input
    const input = document.createElement('input');
    input.type = key.toLowerCase().includes('password') || 
                key.toLowerCase().includes('secret') || 
                key.toLowerCase().includes('api_key') || 
                key.toLowerCase().includes('token') ? 'password' : 'text';
    input.className = 'form-control env-input';
    input.id = `env-${key}`;
    input.name = key;
    input.value = value;
    input.required = required;
    input.dataset.envVar = 'true';
    input.placeholder = required ? 'Required' : 'Optional';
    
    // Create help text if available
    let helpText = null;
    if (property.description) {
      helpText = document.createElement('span');
      helpText.className = 'form-control-help';
      helpText.innerHTML = property.description + (required ? ' <strong>(Required)</strong>' : '');
    }
    
    // Append elements to the form group
    formGroup.appendChild(label);
    formGroup.appendChild(input);
    if (helpText) {
      formGroup.appendChild(helpText);
    }
    
    form.appendChild(formGroup);
  });
  
  envVariablesList.appendChild(form);
  
  // Show the save button
  envActions.style.display = 'flex';
  
  // Check if all required env vars are filled and update the install button
  // Immediately check and update the install button state
  checkEnvVarsAndUpdateInstallButton(mcp);
  
  // Add event listener to the save button
  saveEnvButton.onclick = saveEnvironmentVariables;
  
  // Add event listeners to inputs to update the install button status in real-time
  const inputs = form.querySelectorAll('input[data-env-var="true"]');
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      // Only update button state
      checkEnvVarsAndUpdateInstallButton(mcp);
    });
    
    // For better UX, only keep focus handler without styling changes
    input.addEventListener('focus', () => {
      // No styling changes
    });
    
    input.addEventListener('blur', () => {
      checkEnvVarsAndUpdateInstallButton(mcp);
    });
  });
}

// Save environment variables
async function saveEnvironmentVariables() {
  if (!currentMcpId) return;
  
  // Get the form
  const form = document.getElementById('envVariablesForm');
  if (!form) return;
  
  // Get the MCP to check required fields
  const currentMcp = mcpServers.find(mcp => mcp.id === currentMcpId);
  const explicitlyRequiredFields = currentMcp?.configSchema?.required || [];
  
  // Collect form data
  const formData = {};
  const inputs = form.querySelectorAll('input[data-env-var="true"]');
  
  let isValid = true;
  let missingRequiredFields = [];
  
  inputs.forEach(input => {
    const fieldName = input.name;
    
    // Field is required only if explicitly marked in schema
    const isRequired = explicitlyRequiredFields.includes(fieldName);
    
    if (isRequired && (!input.value || input.value.trim() === '')) {
      isValid = false;
      input.classList.add('invalid');
      missingRequiredFields.push(fieldName);
    } else {
      input.classList.remove('invalid');
      formData[input.name] = input.value.trim();
    }
  });
  
  if (!isValid) {
    alert(`Please fill in all required environment variables: ${missingRequiredFields.join(', ')}`);
    return;
  }
  
  // Save the environment variables as settings
  await window.api.saveMcpSettings(currentMcpId, formData);
  
  // Update current settings
  currentSettings = formData;
  
  // Show success message
  addConsoleMessage('Environment variables saved successfully');
  
  // Update install button state
  checkEnvVarsAndUpdateInstallButton(currentMcp);
}

// Check if all required environment variables are filled and update the install button
function checkEnvVarsAndUpdateInstallButton(mcp) {
  if (!mcp) return;
  
  // If the MCP has no config or properties, enable the install button if not installed
  if (!mcp.configSchema || !mcp.configSchema.properties || Object.keys(mcp.configSchema.properties).length === 0) {
    installButton.disabled = mcp.installed;
    installButton.title = mcp.installed ? 'MCP is already installed' : 'Install this MCP';
    return;
  }
  
  const form = document.getElementById('envVariablesForm');
  if (!form) {
    // No form means no env vars to validate, so enable install
    installButton.disabled = mcp.installed;
    installButton.title = mcp.installed ? 'MCP is already installed' : 'Install this MCP';
    return;
  }
  
  const schema = mcp.configSchema;
  const properties = schema.properties || {};
  
  // Get explicitly required fields from schema
  const explicitlyRequiredFields = schema.required || [];
  
  // If there are no required fields, enable the install button
  if (explicitlyRequiredFields.length === 0) {
    installButton.disabled = mcp.installed;
    installButton.title = mcp.installed ? 'MCP is already installed' : 'Install this MCP';
    return;
  }
  
  // Find all inputs that represent required fields based on schema
  const allInputs = form.querySelectorAll('input[data-env-var="true"]');
  let allRequiredFilled = true;
  let missingFields = [];
  
  allInputs.forEach(input => {
    const fieldName = input.name;
    
    // Field is required only if explicitly marked in schema
    const isRequired = explicitlyRequiredFields.includes(fieldName);
    
    if (isRequired && (!input.value || input.value.trim() === '')) {
      allRequiredFilled = false;
      missingFields.push(fieldName);
    }
  });
  
  // Disable install button if required env vars are not filled
  if (!allRequiredFilled && !mcp.installed) {
    installButton.disabled = true;
    installButton.title = 'Please fill in all required environment variables';
    
    // Remove any previous alert messages
    let alertMsg = document.querySelector('.env-alert');
    if (alertMsg) {
      alertMsg.remove();
    }
  } else if (!mcp.installed) {
    // Only enable if all required fields are filled AND the MCP is not installed
    installButton.disabled = false;
    installButton.title = 'Install this MCP';
    
    // Remove any previous alert messages
    const alertMsg = document.querySelector('.env-alert');
    if (alertMsg) {
      alertMsg.remove();
    }
  } else {
    // If already installed, button should be disabled
    installButton.disabled = true;
    installButton.title = 'MCP is already installed';
  }
}

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

// Clean up when the window is unloaded
window.addEventListener('beforeunload', () => {
  window.api.removeAllListeners();
}); 