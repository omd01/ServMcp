const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Simple build helper for ServMcp
 */
async function main() {
  console.log('ServMcp Build Helper');
  console.log('====================');

  // Check if build directory exists
  const buildDir = path.join(__dirname, 'build');
  if (!fs.existsSync(buildDir)) {
    console.log('⚠️ Build directory not found. Creating it...');
    fs.mkdirSync(buildDir, { recursive: true });
    console.log('⚠️ Remember to add icon files to the build directory:');
    console.log('   - build/icon.ico for Windows');
    console.log('   - build/icon.icns for macOS');
    console.log('   - build/icon.png for Linux');
  }
  
  // Check if icons exist
  const hasWindowsIcon = fs.existsSync(path.join(buildDir, 'icon.ico'));
  const hasMacIcon = fs.existsSync(path.join(buildDir, 'icon.icns'));
  const hasLinuxIcon = fs.existsSync(path.join(buildDir, 'icon.png'));
  
  if (!hasWindowsIcon || !hasMacIcon || !hasLinuxIcon) {
    console.log('⚠️ One or more icon files are missing:');
    if (!hasWindowsIcon) console.log('   - Missing build/icon.ico for Windows');
    if (!hasMacIcon) console.log('   - Missing build/icon.icns for macOS');
    if (!hasLinuxIcon) console.log('   - Missing build/icon.png for Linux');
  }

  // Check if node_modules exists
  if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
  }

  const answer = await askQuestion('Select build option:\n1. Build for Windows\n2. Build for macOS\n3. Build for Linux\n4. Build for all platforms\n5. Create a new release tag\n> ');
  
  switch (answer.trim()) {
    case '1':
      console.log('🏗️ Building for Windows...');
      execSync('npm run build:win', { stdio: 'inherit' });
      break;
    case '2':
      console.log('🏗️ Building for macOS...');
      execSync('npm run build:mac', { stdio: 'inherit' });
      break;
    case '3':
      console.log('🏗️ Building for Linux...');
      execSync('npm run build:linux', { stdio: 'inherit' });
      break;
    case '4':
      console.log('🏗️ Building for all platforms...');
      execSync('npm run build', { stdio: 'inherit' });
      break;
    case '5':
      const version = await askQuestion('Enter version number (e.g., 1.0.0): ');
      console.log(`Creating tag v${version}...`);
      
      // Update version in package.json
      const packageJsonPath = path.join(__dirname, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      packageJson.version = version;
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      
      try {
        execSync('git add package.json', { stdio: 'inherit' });
        execSync(`git commit -m "Bump version to ${version}"`, { stdio: 'inherit' });
        execSync(`git tag -a v${version} -m "Version ${version}"`, { stdio: 'inherit' });
        
        const shouldPush = await askQuestion('Push tag to remote? (y/n): ');
        if (shouldPush.toLowerCase() === 'y') {
          execSync('git push', { stdio: 'inherit' });
          execSync('git push --tags', { stdio: 'inherit' });
          console.log(`✅ Version ${version} tagged and pushed!`);
        } else {
          console.log(`✅ Version ${version} tagged locally. Run 'git push --tags' to push to remote.`);
        }
      } catch (error) {
        console.error('❌ Failed to create tag:', error.message);
      }
      break;
    default:
      console.log('Invalid option');
  }
  
  rl.close();
}

function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

main().catch(console.error);