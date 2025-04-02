# MCP Server Manager

![ServMcp](https://img.shields.io/badge/MCP-Server%20Manager-blue)
![License](https://img.shields.io/badge/license-MIT-green)

A desktop application for managing MCP (Machine Completion Protocol) servers that integrate with AI tools like Claude and Cursor.

![screenshot-placeholder](docs/images/screenshot.png)

## Features

- 🚀 Import and manage MCP servers
- 🔧 Configure environment variables for your MCPs
- 🔌 Easy installation and configuration
- 🖥️ Monitor server console output in real-time
- 🧠 Integrate with various AI tools

## Installation

### Prerequisites

- Node.js 14.x or newer
- npm or yarn
- Electron

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/ServMcp.git
   cd ServMcp
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the application:
   ```
   npm start
   ```

## Usage

### Importing an MCP

1. Click the "Import MCP" button
2. Select your MCP package (ZIP file)
3. Configure any required environment variables
4. Click "Install" to install the MCP

### Managing MCPs

- **Install**: Select an MCP and click the "Install" button
- **Uninstall**: For installed MCPs, click the "Uninstall" button
- **Configure**: Set environment variables before installation

### Environment Variables

The application automatically detects environment variables from the MCP manifest and provides a user-friendly interface to configure them.

## Development

### Project Structure

- `src/main` - Main Electron process
- `src/renderer` - Renderer process (UI)
- `src/common` - Shared code

### Building

```
npm run build
```

### Packaging

```
npm run package
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to submit pull requests, report issues, and suggest improvements.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Code of Conduct

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating in our community.

## Acknowledgments

- The Electron team for their excellent framework
- All our contributors and supporters 