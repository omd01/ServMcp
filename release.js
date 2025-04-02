const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * ServMcp Release Helper
 * This script helps create a new release for ServMcp and publishes it to GitHub.
 * It can:
 * 1. Create a new version tag
 * 2. Build the application
 * 3. Create a GitHub release
 */
async function main() {
  console.log('ServMcp Release Helper');
  console.log('=====================');

  // Check if required directories exist
  ensureDirectoryExists('build');

  // Check if icons exist
  checkIcons();

  // Get the current version from package.json
  const packageJsonPath = path.join(__dirname, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentVersion = packageJson.version;

  console.log(`Current version: ${currentVersion}`);
  
  // Ask for the new version
  const newVersion = await askQuestion(`Enter new version (or press Enter to use ${currentVersion}): `);
  const version = newVersion.trim() || currentVersion;
  
  if (version !== currentVersion) {
    // Update package.json
    packageJson.version = version;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log(`Updated package.json to version ${version}`);
  }

  // Commit package.json changes if needed
  if (version !== currentVersion) {
    try {
      execSync('git add package.json', { stdio: 'inherit' });
      execSync(`git commit -m "Bump version to ${version}"`, { stdio: 'inherit' });
      console.log('Committed version change');
    } catch (error) {
      console.warn('Warning: Could not commit version change. Continuing anyway...');
    }
  }

  // Create git tag
  const tagName = `v${version}`;
  try {
    // Check if tag already exists
    try {
      execSync(`git tag -l "${tagName}"`, { stdio: 'pipe' });
      const shouldOverwrite = await askQuestion(`Tag ${tagName} already exists. Overwrite? (y/n): `);
      if (shouldOverwrite.toLowerCase() === 'y') {
        execSync(`git tag -d ${tagName}`, { stdio: 'inherit' });
      } else {
        console.log('Keeping existing tag');
      }
    } catch (error) {
      // Tag doesn't exist, which is fine
    }

    execSync(`git tag -a ${tagName} -m "Version ${version}"`, { stdio: 'inherit' });
    console.log(`Created tag ${tagName}`);
  } catch (error) {
    console.error('Error creating tag:', error.message);
    const shouldContinue = await askQuestion('Continue anyway? (y/n): ');
    if (shouldContinue.toLowerCase() !== 'y') {
      console.log('Aborting');
      process.exit(1);
    }
  }

  // Ask which platforms to build for
  console.log('\nSelect platforms to build:');
  console.log('1. Windows only');
  console.log('2. macOS only');
  console.log('3. Both Windows and macOS');
  console.log('4. Skip building (tag only)');
  
  const platformChoice = await askQuestion('Enter choice (1-4): ');
  
  let buildWindows = false;
  let buildMac = false;
  
  switch (platformChoice) {
    case '1':
      buildWindows = true;
      break;
    case '2':
      buildMac = true;
      break;
    case '3':
      buildWindows = true;
      buildMac = true;
      break;
    case '4':
      console.log('Skipping build');
      break;
    default:
      console.log('Invalid choice. Skipping build');
      break;
  }

  // Build the application
  try {
    if (buildWindows) {
      console.log('\nBuilding for Windows...');
      execSync('npm run build:win', { stdio: 'inherit' });
    }
    
    if (buildMac) {
      console.log('\nBuilding for macOS...');
      execSync('npm run build:mac', { stdio: 'inherit' });
    }
  } catch (error) {
    console.error('Build failed:', error.message);
    const shouldContinue = await askQuestion('Continue with release anyway? (y/n): ');
    if (shouldContinue.toLowerCase() !== 'y') {
      console.log('Aborting');
      process.exit(1);
    }
  }

  // Create release directory if it doesn't exist
  const releaseDir = path.join(__dirname, 'release');
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }

  // Copy build artifacts to release directory
  try {
    console.log('\nCopying artifacts to release directory...');
    
    const distDir = path.join(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      // Copy Windows artifacts
      if (buildWindows) {
        const windowsFiles = fs.readdirSync(distDir).filter(file => 
          file.endsWith('.exe') || file.endsWith('.msi') || file === 'latest.yml'
        );
        
        for (const file of windowsFiles) {
          fs.copyFileSync(
            path.join(distDir, file),
            path.join(releaseDir, file)
          );
          console.log(`Copied ${file} to release directory`);
        }
      }
      
      // Copy macOS artifacts
      if (buildMac) {
        const macFiles = fs.readdirSync(distDir).filter(file => 
          file.endsWith('.dmg') || file.endsWith('.zip') || file === 'latest-mac.yml'
        );
        
        for (const file of macFiles) {
          fs.copyFileSync(
            path.join(distDir, file),
            path.join(releaseDir, file)
          );
          console.log(`Copied ${file} to release directory`);
        }
      }
    }
  } catch (error) {
    console.error('Error copying artifacts:', error.message);
  }

  // Push the tag to GitHub
  const shouldPush = await askQuestion('\nPush tag to GitHub? (y/n): ');
  if (shouldPush.toLowerCase() === 'y') {
    try {
      execSync('git push origin ' + tagName, { stdio: 'inherit' });
      console.log(`\nPushed tag ${tagName} to GitHub`);
      console.log('\nGitHub Actions will automatically create a release with the built artifacts.');
      console.log('Check the "Actions" tab on GitHub to monitor progress.');
    } catch (error) {
      console.error('Error pushing tag:', error.message);
    }
  } else {
    console.log('\nSkipping push to GitHub');
    console.log(`\nRun 'git push origin ${tagName}' to push the tag and trigger a GitHub release.`);
  }

  console.log('\nRelease process completed!');
  console.log('Artifacts are available in the release directory.');
  
  rl.close();
}

function askQuestion(question) {
  return new Promise(resolve => {
    rl.question(question, answer => {
      resolve(answer);
    });
  });
}

function ensureDirectoryExists(dirName) {
  const dirPath = path.join(__dirname, dirName);
  if (!fs.existsSync(dirPath)) {
    console.log(`Creating ${dirName} directory...`);
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function checkIcons() {
  const buildDir = path.join(__dirname, 'build');
  const hasWindowsIcon = fs.existsSync(path.join(buildDir, 'icon.ico'));
  const hasMacIcon = fs.existsSync(path.join(buildDir, 'icon.icns'));
  
  if (!hasWindowsIcon || !hasMacIcon) {
    console.log('⚠️ Missing icon files:');
    if (!hasWindowsIcon) console.log('   - Missing build/icon.ico for Windows');
    if (!hasMacIcon) console.log('   - Missing build/icon.icns for macOS');
    
    // Create placeholder icons
    if (!hasWindowsIcon) {
      try {
        // Try to use the electron icon as a placeholder
        const electronIconPath = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.ico');
        if (fs.existsSync(electronIconPath)) {
          fs.copyFileSync(electronIconPath, path.join(buildDir, 'icon.ico'));
          console.log('   Created placeholder Windows icon');
        }
      } catch (error) {
        console.log('   Could not create placeholder Windows icon');
      }
    }
  }
}

// Run the main function
main().catch(console.error);