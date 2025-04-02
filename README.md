# ServMcp - MCP Server Manager

![ServMcp](https://img.shields.io/badge/MCP-Server%20Manager-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Release](https://img.shields.io/github/v/release/yourusername/ServMcp)
![Downloads](https://img.shields.io/github/downloads/yourusername/ServMcp/total)

A desktop application for managing MCP (Machine Completion Protocol) servers that integrate with AI tools like Claude and Cursor.

![screenshot](docs/images/screenshot.png)

## 🚀 Features

- Import and manage MCP servers
- Configure environment variables for your MCPs
- Easy installation and configuration
- Monitor server console output in real-time
- Integrate with AI tools like Claude and Cursor

## 📥 Download

| Platform | Download |
|----------|----------|
| Windows | [Latest Release (.exe)](https://github.com/yourusername/ServMcp/releases/latest/download/ServMcp-Setup.exe) |
| macOS | [Latest Release (.dmg)](https://github.com/yourusername/ServMcp/releases/latest/download/ServMcp.dmg) |
| Linux | [Latest Release (.AppImage)](https://github.com/yourusername/ServMcp/releases/latest/download/ServMcp.AppImage) |

Or visit the [Releases](https://github.com/yourusername/ServMcp/releases) page for all available downloads.

## 🔧 Installation

### Windows
1. Download the installer from the link above
2. Run the installer and follow the instructions
3. Launch ServMcp from the Start menu

### macOS
1. Download the .dmg file from the link above
2. Open the .dmg file
3. Drag ServMcp to the Applications folder
4. Launch ServMcp from Applications

### Linux
1. Download the .AppImage file from the link above
2. Make it executable: `chmod +x ServMcp.AppImage`
3. Run the AppImage: `./ServMcp.AppImage`

## 📚 Usage Guide

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

## 🛠️ Development

Want to contribute or run from source?

### Prerequisites

- Node.js 14.x or newer
- npm or yarn
- Git

### Setup from Source

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

### Building from Source

```
npm run build
```

This will create distribution packages for your current platform in the `dist` directory.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to submit pull requests, report issues, and suggest improvements.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📢 Acknowledgments

- The Electron team for their excellent framework
- All contributors and supporters