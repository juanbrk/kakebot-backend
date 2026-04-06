# Creating New Personas

This document describes the process for creating and integrating new personas into the system.

## Structure

Every persona file lives in one of three directories:
- `.claude/rules/personas/architects/` — Strategic, high-level thinkers
- `.claude/rules/personas/producers/` — Execution-focused, concrete thinkers
- `.claude/rules/personas/creators/` — Innovation-focused, exploratory thinkers

## Template

Every persona file must follow this exact structure:

```markdown
# Persona: [Name]

## Activation
**Trigger:** `PERSONA: [Name]`
**Category:** [Architects / Producers / Creators]

## Core Mindset
[3-4 bullets with key strengths — extracted from source material]
- Bullet about primary strength
- Bullet about secondary strength
- Bullet about tertiary strength
- Bullet about how they operate

## Key Questions
[4 questions the persona asks when activated]
- What is question 1?
- What is question 2?
- What is question 3?
- What is question 4?

## Behavioral Rules
[4-5 operational rules — IMPERATIVE, not descriptive]
- Do X in all situations.
- Do NOT Y when Z.
- Always ensure P before Q.
- Never skip R.

## Best Used For
[3-4 bullets describing ideal use cases]
- Context 1
- Context 2
- Context 3

## Avoid When
[2-3 bullets describing when NOT to use this persona]
- Condition that makes this persona ineffective
- Condition where another persona is better
```

## Behavioral Rules — Critical Requirement

The `## Behavioral Rules` section is **the most important**. It must be:
- **Imperative, not descriptive**: "Do X" not "X is done by..."
- **Actionable for the entire session**: Rules apply consistently from first message to last
- **Mutually consistent**: Rules should not contradict each other
- **Distinct from other personas**: No two personas should have identical rule sets

### What NOT to do:
```
## Behavioral Rules
- The Investigator is analytical and objective.
- The Investigator values evidence over opinion.
```

### What TO do:
```
## Behavioral Rules
- Always state the evidence gathered before proposing a solution.
- Do NOT propose solutions before explicitly stating the evidence gathered.
- Always test assumptions against data — do not accept "it seems like" reasoning.
- Do NOT form conclusions from a single data point — require corroboration.
```

## Adding a New Persona

### 1. Choose a category
Decide: Architects, Producers, or Creators?
- **Architects**: Strategic thinking, planning, oversight
- **Producers**: Execution, analysis, deep technical work
- **Creators**: Innovation, design, novel approaches

### 2. Create the file
File name format: `[kebab-case-name].md`
Location: `.claude/rules/personas/[category]/[kebab-case-name].md`

Example: `.claude/rules/personas/architects/orchestrator.md`

### 3. Fill in the template
Extract information from your source material (guide, job description, etc.):
- **Core Mindset** ← "Core strengths" section
- **Key Questions** ← "Questions to ask yourself" section
- **Behavioral Rules** ← "In practice" + "Core strengths", reformatted as imperatives
- **Best Used For** ← "When to invoke" section
- **Avoid When** ← "Red flags" section

### 4. Update personas/README.md
Add a row to the invocation table:
```markdown
| `PERSONA: Name` | The Name | One-line description of use case |
```

Optionally add to "Recommended Combos" if this persona pairs well with others.

### 5. Document the decision
Add an entry to `.claude/rules/shared/memory-decisions.md`:
```markdown
## YYYY-MM-DD: New persona added — The [Name]
- Category: [Architects/Producers/Creators]
- Purpose: [one line]
- Best used with: [other personas it pairs well with]
```

### 6. Commit
```bash
git add .claude/rules/personas/
git commit -m "Add persona: The [Name]"
```

## Consistency Across All Personas

Every persona must:
- Have a unique trigger phrase (no duplicates)
- Have a unique category placement
- Have distinct behavioral rules (not copied from another persona)
- Be usable across the entire conversation (not just one specific task)
- Have at least one valid "Best Used For" context (not theoretical)

## Examples of Well-Formed Personas

See the existing 8 personas in this system:
- Strategist, Planner, Orchestrator (Architects)
- Implementer, Investigator, Technician (Producers)
- Artisan, Inventor (Creators)

Each is self-contained, has clear behavioral rules, and can be invoked independently.
