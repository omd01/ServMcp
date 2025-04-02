# ServMcp Release Guide

This document outlines the process for creating new releases of the ServMcp application.

## Prerequisites

- You have push access to the repository
- You have Node.js and npm installed
- You have Git configured

## Release Process

### 1. Prepare the Release

1. Make sure all changes for the release are merged into the main branch
2. Pull the latest changes:
   ```bash
   git checkout main
   git pull
   ```

3. Run the build helper script and select option 5 to create a new release tag:
   ```bash
   node build.js
   ```
   
   This will:
   - Prompt you for the new version number
   - Update the version in package.json
   - Create a Git commit for the version bump
   - Create a Git tag for the new version
   - Optionally push the changes to GitHub

4. Alternatively, do it manually:
   ```bash
   # Update version in package.json
   npm version x.y.z

   # Create a tag
   git tag -a vx.y.z -m "Version x.y.z"
   
   # Push changes and tags
   git push
   git push --tags
   ```

### 2. GitHub Actions Automated Build (Recommended)

Once you push a tag prefixed with 'v' (e.g., v1.0.0), GitHub Actions will automatically:
1. Build the app for Windows and macOS
2. Create a new GitHub release
3. Upload the built artifacts to the release

Check the "Actions" tab on your GitHub repository to monitor the build progress.

### 3. Manual Build (Alternative)

If you prefer to build locally:

1. For Windows:
   ```bash
   npm run build:win
   ```

2. For macOS:
   ```bash
   npm run build:mac
   ```

3. For Linux:
   ```bash
   npm run build:linux
   ```

4. For all platforms (requires appropriate build environment):
   ```bash
   npm run build
   ```

The build artifacts will be located in the `dist` directory.

### 4. Create Release on GitHub Manually

If not using GitHub Actions:

1. Go to your repository on GitHub
2. Click on "Releases"
3. Click "Draft a new release"
4. Select the tag you created
5. Add a title and description for your release
6. Upload the distribution files from your `dist` directory
7. Publish the release

## Version Numbering

We use [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for new functionality in a backwards compatible manner
- **PATCH** version for backwards compatible bug fixes

## Release Checklist

- [ ] All planned features and bug fixes are implemented
- [ ] All tests pass (if applicable)
- [ ] Version number is updated in package.json
- [ ] CHANGELOG.md is updated (if applicable)
- [ ] Git tag is created
- [ ] Builds complete successfully
- [ ] Release notes completed
- [ ] Release published on GitHub

## Troubleshooting

### Code Signing Issues

If you encounter code signing issues:

- **Windows**: You need a valid code signing certificate. Update the GitHub workflow file with your certificate information.
- **macOS**: You need an Apple Developer account and appropriate certificates. Set up the certificates in your GitHub repository secrets.

### Build Failures

- Check the GitHub Actions logs for detailed error information
- Ensure all dependencies are correctly installed
- Verify that the application runs locally with `npm start`