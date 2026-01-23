# Agent Skills

Chorus supports **Agent Skills** - reusable prompt templates and scripts that extend AI capabilities for specific tasks. Skills follow the open [Agent Skills specification](https://agentskills.io).

## What are Skills?

Skills are collections of instructions, prompts, and optional scripts that help AI assistants perform specialized tasks. Each skill contains:

- **SKILL.md** - A markdown file with instructions and metadata
- **scripts/** (optional) - Executable scripts the AI can run
- **Reference files** (optional) - Additional context files

When you enable a skill, its description is added to the AI's system prompt. The AI can then load full skill instructions when relevant to your conversation.

## Skill Locations

Chorus discovers skills from these directories:

| Location | Path | Priority |
|----------|------|----------|
| User | `~/.chorus/skills/` | Lower |
| User | `~/.claude/skills/` | Lower |
| Project | `./.chorus/skills/` | Higher (overrides user) |
| Project | `./.claude/skills/` | Higher (overrides user) |

Project-level skills override user-level skills with the same name.

## Creating a Skill

1. Create a folder in one of the skill locations above
2. Add a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: A brief description of what this skill does and when to use it.
---

# My Skill Instructions

Detailed instructions for the AI go here...
```

### Required Fields

- `name` - Unique identifier (lowercase, hyphens allowed)
- `description` - Brief description for the AI to know when to use this skill

### Optional Fields

- `license` - License name or file reference
- `compatibility` - Environment requirements
- `metadata` - Custom key-value pairs
- `allowedTools` - Pre-approved tools for this skill

## Managing Skills

### Settings

Open **Settings > Skills** to:
- View all discovered skills
- Enable/disable individual skills
- Set invocation mode (Auto or Manual)

<!-- TODO: Add screenshot of Skills settings -->

### Invocation Modes

- **Auto** - The AI sees this skill's description and can invoke it automatically when relevant
- **Manual** - The skill is only loaded when you explicitly type `/skill-name`

### Slash Commands

Type `/` in the chat input to see available skills and quickly invoke them:

<!-- TODO: Add screenshot of skill autocomplete -->

## Skill Scripts

Skills can include executable scripts in a `scripts/` subdirectory:

```
my-skill/
  SKILL.md
  scripts/
    deploy.sh
    validate.py
```

The AI can list and execute these scripts using the skills tools when the Terminal toolset is enabled.

## Examples

### Code Review Skill

```markdown
---
name: code-review
description: Systematic code review guidelines. Invoke when reviewing PRs or code changes.
---

# Code Review Checklist

## Functionality
- [ ] Code does what it's supposed to do
- [ ] Edge cases are handled
- [ ] Error handling is present

## Security
- [ ] No hardcoded secrets
- [ ] Input validation present
...
```

### Deploy Helper Skill

```markdown
---
name: deploy-helper
description: Deployment assistance for production releases. Use when deploying or troubleshooting deployments.
---

# Deployment Instructions

Follow these steps for a safe production deployment...
```

## Learn More

- [Agent Skills Specification](https://agentskills.io) - The open standard for AI skills
- [SKILL.md Format](https://agentskills.io/spec) - Detailed specification for skill files

## Troubleshooting

### Skills not appearing

1. Check that your skill folder contains a valid `SKILL.md` file
2. Ensure the frontmatter has required `name` and `description` fields
3. Click the refresh button in Settings > Skills

### Skill not being used by AI

1. Check that the skill is enabled in Settings > Skills
2. For automatic invocation, ensure the skill is set to "Auto" mode
3. The AI uses skills based on relevance - try being more explicit in your request
