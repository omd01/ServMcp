# Contributing to MCP Server Manager

Thank you for considering contributing to MCP Server Manager! This document outlines the process for contributing to the project.

## Code of Conduct

By participating in this project, you are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

This section guides you through submitting a bug report. Following these guidelines helps maintainers understand your report, reproduce the issue, and find related reports.

Before creating bug reports, please check [the issue list](https://github.com/yourusername/ServMcp/issues) as you might find that the issue has already been reported.

**When submitting a bug report, please include as many details as possible:**

- **Use a clear and descriptive title** for the issue
- **Describe the exact steps which reproduce the problem** 
- **Provide specific examples** to demonstrate the steps
- **Describe the behavior you observed**
- **Explain what behavior you expected to see**
- **Include screenshots and animated GIFs** if possible
- **Include your environment details** (OS, Node.js version, etc.)

### Suggesting Features

This section guides you through submitting a feature suggestion.

**When submitting a feature suggestion, include:**

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested feature**
- **Explain why this feature would be useful**
- **List any alternatives you've considered**
- **Include mockups or examples** if applicable

### Your First Code Contribution

Unsure where to begin contributing? Start by looking at issues labeled `beginner-friendly` or `help-wanted`.

### Pull Requests

Follow these steps when submitting a pull request:

1. **Fork the repository**
2. **Create a new branch** for your feature or bugfix (`git checkout -b feature/your-feature` or `git checkout -b fix/your-bugfix`)
3. **Make your changes** in the new branch
4. **Run tests** and ensure they pass
5. **Commit your changes** with a clear commit message that explains the changes you've made
6. **Push to your branch**
7. **Create a pull request**

## Development Setup

To set up the project for development:

1. Clone the repository
   ```
   git clone https://github.com/yourusername/ServMcp.git
   cd ServMcp
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Start the application in development mode
   ```
   npm start
   ```

## Styleguides

### Git Commit Messages

* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests liberally after the first line
* Consider starting the commit message with an applicable emoji:
    * 🎨 `:art:` when improving the format/structure of the code
    * ⚡️ `:zap:` when improving performance
    * 🔥 `:fire:` when removing code or files
    * 🐛 `:bug:` when fixing a bug
    * ✨ `:sparkles:` when adding a new feature

### JavaScript Styleguide

* Use 2 spaces for indentation
* Use semicolons
* Prefer `const` over `let` when possible
* Prefer template literals over string concatenation
* Always add proper JSDoc comments for functions and classes

### CSS Styleguide

* Use classes rather than IDs for styling
* Use a logical naming structure for classes (BEM is recommended)
* Group related properties together

## Additional Notes

### Issue and Pull Request Labels

This section lists the labels we use to help track and manage issues and pull requests.

* `bug` - Issues that are bugs
* `documentation` - Issues with documentation
* `duplicate` - Issues or PRs that are duplicates
* `enhancement` - Feature requests
* `good first issue` - Good for newcomers
* `help wanted` - Extra attention is needed
* `invalid` - Issues that aren't valid
* `question` - Issues that are questions
* `wontfix` - Issues that won't be worked on

## Thank You!

Thank you for contributing to MCP Server Manager! 