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
  }
  
  // Update button states
  updateButtonStates(selectedMcp);
  
  // Render AI tools
  renderAiTools(selectedMcp);
  
  // Clear console output
  consoleOutput.innerHTML = '';
  
  // Show the detail panel
  serverDetail.classList.remove('hidden');
}

// Update the button states based on the MCP server state
function updateButtonStates(mcp) {
  installButton.disabled = mcp.installed;
  uninstallButton.disabled = !mcp.installed || mcp.running;
}

// Render the AI tools list
function renderAiTools(mcp) {
  // Clear the current list
  aiToolsList.innerHTML = '';
  
  // If the MCP server is not installed, show a message
  if (!mcp.installed) {
    aiToolsList.innerHTML = '<div class="loading">Install the MCP server to view available AI tools</div>';
    return;
  }
  
  // If no AI tools, show a message
  if (!mcp.aiTools || mcp.aiTools.length === 0) {
    aiToolsList.innerHTML = '<div class="loading">No AI tools available for this MCP</div>';
    return;
  }
  
  // Create an element for each AI tool
  mcp.aiTools.forEach(tool => {
    const toolElement = document.createElement('div');
    toolElement.className = 'tool-item';
    
    // Create the checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tool-checkbox';
    checkbox.id = `tool-${tool.id}`;
    checkbox.checked = tool.connected;
    
    // Add change handler to toggle the tool connection
    checkbox.addEventListener('change', async () => {
      await toggleAiTool(mcp.id, tool.id);
    });
    
    // Create the label
    const label = document.createElement('label');
    label.className = 'tool-name';
    label.htmlFor = `tool-${tool.id}`;
    label.textContent = tool.name;
    
    // Add credential indicator if required
    let credentialIndicator = '';
    if (tool.requiresCredentials) {
      credentialIndicator = document.createElement('span');
      credentialIndicator.className = 'credential-required';
      credentialIndicator.textContent = 'Requires API Key';
    }
    
    // Append elements to the tool item
    toolElement.appendChild(checkbox);
    toolElement.appendChild(label);
    if (credentialIndicator) {
      toolElement.appendChild(credentialIndicator);
    }
    
    aiToolsList.appendChild(toolElement);
  });
}

// Toggle an AI tool connection
async function toggleAiTool(mcpId, toolId) {
  const result = await window.api.toggleAiTool(mcpId, toolId);
  
  // If credentials are required, show the modal
  if (!result.success && result.requiresCredentials) {
    showCredentialModal(toolId);
    return;
  }
  
  // Refresh MCP servers and update UI
  await refreshMcpServers();
}

// Show the credential input modal
function showCredentialModal(toolId) {
  currentToolId = toolId;
  
  // Find the tool name
  const mcp = mcpServers.find(mcp => mcp.id === currentMcpId);
  const tool = mcp.aiTools.find(tool => tool.id === toolId);
  
  credentialMessage.textContent = `Please enter your API credentials for ${tool.name}:`;
  apiKeyInput.value = '';
  
  credentialModal.classList.remove('hidden');
}

// Hide the credential modal
function hideCredentialModal() {
  credentialModal.classList.add('hidden');
  currentToolId = null;
}

// Save credentials and try to connect again
async function saveCredentials() {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    // Show error message
    alert('Please enter a valid API key');
    return;
  }
  
  // Save the credentials
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
      label.textContent = `${property.title || key}${required ? ' *' : ''}:`;
      
      // Create input
      const input = document.createElement('input');
      input.type = property.format === 'password' ? 'password' : 'text';
      input.className = 'form-control';
      input.id = `setting-${key}`;
      input.name = key;
      input.value = value;
      input.required = required;
      
      // Create help text if available
      let helpText = null;
      if (property.description) {
        helpText = document.createElement('span');
        helpText.className = 'form-control-help';
        helpText.textContent = property.description;
      }
      
      // Append elements to the form group
      formGroup.appendChild(label);
      formGroup.appendChild(input);
      if (helpText) {
        formGroup.appendChild(helpText);
      }
      
      settingsForm.appendChild(formGroup);
    });
  } else {
    // For MongoDB MCP specifically
    const formGroup = document.createElement('div');
    formGroup.className = 'form-group';
    
    const label = document.createElement('label');
    label.htmlFor = 'setting-mongoConnectionUrl';
    label.textContent = 'MongoDB Connection URL *:';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-control';
    input.id = 'setting-mongoConnectionUrl';
    input.name = 'mongoConnectionUrl';
    input.value = currentSettings.mongoConnectionUrl || '';
    input.required = true;
    
    const helpText = document.createElement('span');
    helpText.className = 'form-control-help';
    helpText.textContent = 'Connection URL in the format mongodb://<username>:<password>@<host>:<port>/<database>?authSource=admin';
    
    formGroup.appendChild(label);
    formGroup.appendChild(input);
    formGroup.appendChild(helpText);
    
    settingsForm.appendChild(formGroup);
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
    // Call the main process to handle the import
    const result = await window.api.importMcp();
    
    if (result.success) {
      // Show success message
      addConsoleMessage(`MCP package imported successfully: ${result.mcpId}`);
      
      // Refresh MCP servers and update UI
      await refreshMcpServers();
      
      // Select the imported MCP
      selectMcpServer(result.mcpId);
      
      // If the MCP requires configuration, show the settings modal
      if (result.hasConfig) {
        setTimeout(() => {
          showSettingsModal();
        }, 500);
      }
    } else {
      // Show error message
      addConsoleMessage(`Import failed: ${result.message}`, true);
    }
  } catch (error) {
    addConsoleMessage(`Import error: ${error.message}`, true);
  }
}

// Install an MCP server
async function installMcpServer() {
  if (!currentMcpId) return;
  
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
  if (!confirm(`Are you sure you want to uninstall ${detailTitle.textContent}?`)) {
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
    }
  }
}

// Set up event listeners
function setupEventListeners() {
  // Button click handlers
  importButton.addEventListener('click', importMcpPackage);
  installButton.addEventListener('click', installMcpServer);
  uninstallButton.addEventListener('click', uninstallMcpServer);
  settingsButton.addEventListener('click', showSettingsModal);
  
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

// Start the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

// Clean up when the window is unloaded
window.addEventListener('beforeunload', () => {
  window.api.removeAllListeners();
}); 