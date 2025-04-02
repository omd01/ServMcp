const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('ServMcp Simple Build Script');
console.log('==========================');

// Create build directory if it doesn't exist
const buildDir = path.join(__dirname, 'build');
if (!fs.existsSync(buildDir)) {
  console.log('Creating build directory...');
  fs.mkdirSync(buildDir, { recursive: true });
}

// Create a placeholder icon if needed
const iconPath = path.join(buildDir, 'icon.ico');
if (!fs.existsSync(iconPath)) {
  console.log('Creating placeholder icon...');
  // This is a very basic placeholder icon - you'll want to replace it
  fs.copyFileSync(
    path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.ico'),
    iconPath
  );
}

// Define the simplified package.json for building
const buildConfig = {
  name: "ServMcp",
  version: "1.0.0",
  description: "MCP Server Manager",
  main: "main.js",
  build: {
    appId: "com.mcp.servmcp",
    productName: "ServMcp",
    files: ["**/*"],
    win: {
      target: "portable",
      icon: "build/icon.ico",
      artifactName: "ServMcp-${version}.exe"
    }
  }
};

// Write a temporary config file
const tempConfigPath = path.join(__dirname, 'temp-electron-builder.json');
fs.writeFileSync(tempConfigPath, JSON.stringify(buildConfig, null, 2));

try {
  console.log('Building portable Windows version...');
  execSync('npx electron-builder --win --config temp-electron-builder.json', {
    stdio: 'inherit'
  });
  console.log('\nBuild completed successfully! Check the dist folder for your application.');
} catch (error) {
  console.error('Build failed:', error.message);
} finally {
  // Clean up
  fs.unlinkSync(tempConfigPath);
}