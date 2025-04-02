# MCP Server Manager

A desktop application for managing Machine Communication Protocol (MCP) servers with AI tool integration.

## Features

- Dashboard of available MCP servers
- Local installation and execution of MCP servers
- Start/stop functionality for MCP servers
- AI tools configuration and integration
- Secure credential management for AI tools
- Real-time console output from MCP servers

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm (v6 or later)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd mcp-manager

# Install dependencies
npm install

# Start the application
npm start
```

### Building for Distribution

```bash
# Build for your current platform
npm run build
```

## Usage

1. Launch the application to see the dashboard of available MCP servers
2. Select an MCP server from the list to view details
3. Click "Install" to install the selected MCP server
4. Click "Start" to start the MCP server
5. Configure AI tools integration by checking the boxes next to each tool
6. Enter API credentials when prompted
7. Monitor the server output in the console section
8. Click "Stop" to stop the running MCP server

## Development

The application is built with Electron and follows this structure:

- `main.js` - Main process file
- `src/main/` - Main process modules
- `src/renderer/` - Renderer process files (HTML, CSS, JS)
- `src/data/` - Data storage and configurations

## Future Enhancements

- Cloud-based MCP uploads
- User account management
- Additional AI tool integrations
- Enhanced security features
- Performance monitoring and logging 