# Skills

A skill teaches an agent how to work through the board, which the MCP tools
alone do not: the tools say what can be called, the skill says what the method
is. Install it once and every session that connects to your board follows the
same discipline.

## overclick

The working method: claim before you work, the card as a contract (what, why,
how to confirm), delivering with measured usage instead of estimates, and the
honesty rules that make a review queue worth trusting.

**Claude Code**

```bash
mkdir -p ~/.claude/skills/overclick
curl -sL https://raw.githubusercontent.com/ustoppble/overclick/main/skills/overclick/SKILL.md \
  -o ~/.claude/skills/overclick/SKILL.md
```

**Other agents**: the file is plain markdown with a name and a description in
its frontmatter. Drop it wherever your harness reads its instructions from, or
paste it into the project rules file it already loads.
