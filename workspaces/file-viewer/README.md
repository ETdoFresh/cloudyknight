# File Viewer Workspace

This is a file viewer workspace for CloudyKnight that allows you to browse and view files from different workspaces.

## Features

- Tree view file navigation
- Syntax highlighting for code files
- Markdown rendering
- Image preview support
- Binary file detection and download
- Dark mode synchronized with workspace-theme

## Usage

1. Select a workspace from the dropdown
2. Navigate through the file tree
3. Click on files to view their contents
4. Use the download button for binary files
5. Toggle dark mode with the theme button

## Technical Details

This workspace uses the CloudyKnight command execution API to:
- List files using shell commands
- Read file contents with `cat` or `base64`
- Provide file metadata with `stat`

Created: 2025-08-20