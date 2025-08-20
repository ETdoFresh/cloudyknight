# Claude Code Status Lines

This directory contains different status line configurations for Claude Code.

## Available Status Lines

### default.sh
The default custom status line with:
- 📁 Current directory
- 🌿 Git branch and status
- 🐍 Python virtual environment
- ⬢ Node.js version
- 🐳 Docker presence
- 📊 Memory usage
- ✍️ Output style (when not default)
- 🕐 Time (Chicago/CDT timezone)
- 🧠 Model name with color coding

### ccusage.sh
Enhanced status line using the ccusage npm package:
- 💰 Session costs and burn rate
- 📊 Token usage (input/output/total)
- ⏱️ Time remaining in 5-hour billing block
- 📈 Context usage percentage
- 🔄 Auto-refresh with caching

Requires: `npm install -g ccusage`

## Switching Status Lines

To change your status line, edit `.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "./.claude/statusline/default.sh",
    "padding": 0
  }
}
```

Replace `default.sh` with `ccusage.sh` to use the ccusage status line.

## Creating Custom Status Lines

1. Create a new shell script in this directory (e.g., `custom.sh`)
2. Make it executable: `chmod +x custom.sh`
3. Read JSON from stdin and output your formatted status line
4. Update `settings.json` to point to your new script

## JSON Input

Scripts receive JSON input via stdin with the following structure:
- `model.display_name` - Model name (e.g., "Claude 3.5 Sonnet")
- `model.id` - Model ID (e.g., "claude-3-5-sonnet")
- `workspace.current_dir` - Current working directory
- `workspace.project_dir` - Project root directory
- `output_style.name` - Current output style
- `session_id` - Unique session identifier
- `version` - Claude Code version