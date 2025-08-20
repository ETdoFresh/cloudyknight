# Update Memory Command

This command updates the MEMORY.md file with important implementation details discovered during the current conversation.

## Instructions for Claude

When this command is invoked, you should:

1. **Review the conversation history** to identify important technical discoveries, solutions, and implementation details
2. **Read the existing MEMORY.md** file to understand what's already documented
3. **Append new discoveries** to the appropriate sections or create new sections as needed
4. **Focus on reusable knowledge** that will be helpful for future development sessions
5. **Preserve existing content** - only add new information, don't remove anything

## What to Document

### Include:
- Configuration solutions that worked
- Debugging techniques that solved problems
- Important file paths and project structure insights
- Docker/Traefik/Vite configuration discoveries
- Integration patterns between services
- Common pitfalls and their solutions
- Code patterns that work well with the project architecture

### Don't Include:
- Temporary test changes (like making buttons red)
- Failed attempts (unless they teach an important lesson)
- Personal conversation details
- Redundant information already in MEMORY.md

## Format

When adding to MEMORY.md, follow this structure:

1. Find the most relevant existing section or create a new one
2. Add a timestamp comment for context: `<!-- Added: YYYY-MM-DD -->`
3. Write clear, concise technical documentation
4. Include code examples where helpful
5. Use markdown formatting for readability

## Example Addition

```markdown
## New Section Name
<!-- Added: 2024-01-20 -->

### Problem Discovered
Brief description of the issue encountered

### Solution
How it was resolved, including any code or configuration changes

### Key Insights
- Important point 1
- Important point 2
```

## Command Usage

When invoked with `/update-memory`, Claude will:
1. Analyze the current conversation for valuable technical insights
2. Read the existing MEMORY.md
3. Add new discoveries to the file
4. Confirm what was added

Arguments provided (if any):
```
$ARGUMENTS
```

If arguments are provided, they can specify:
- A specific topic to focus on
- A section name to add content under
- "review" to just show what would be added without saving