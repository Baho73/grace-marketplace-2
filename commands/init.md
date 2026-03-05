Initialize GRACE framework structure for this project.

## Template Files

All documents MUST be created from template files located in the plugin's `templates/` directory.
Read each template file, replace the `$PLACEHOLDER` variables with actual values gathered from the user, and write the result to the target project path.

| Template source                          | Target in project           |
|------------------------------------------|-----------------------------|
| `templates/CLAUDE.md.template`           | `CLAUDE.md` (project root)  |
| `templates/docs/knowledge-graph.xml.template` | `docs/knowledge-graph.xml`  |
| `templates/docs/requirements.xml.template`    | `docs/requirements.xml`     |
| `templates/docs/technology.xml.template`      | `docs/technology.xml`       |
| `templates/docs/development-plan.xml.template`| `docs/development-plan.xml` |

> **Important:** Never hardcode template content inline. Always read from the `.template` files — they are the single source of truth for document structure.

## Steps

1. **Gather project info from the user.** Ask for:
   - Project name and short annotation
   - Main keywords (for domain activation)
   - Primary language, runtime, and framework (with versions)
   - Key libraries/dependencies (if known)
   - High-level module list (if known)

2. **Create `docs/` directory and populate documents from templates:**

   For each `templates/docs/*.xml.template` file:
   - Read the template file
   - Replace `$PLACEHOLDER` variables with user-provided values
   - Write the result to the corresponding `docs/` path

3. **Create or verify `CLAUDE.md` at project root:**
   - If `CLAUDE.md` does not exist — read `templates/CLAUDE.md.template`, fill in `$KEYWORDS` and `$ANNOTATION`, and write to project root
   - If `CLAUDE.md` already exists — warn the user and ask whether to overwrite or keep the existing one

4. **Print a summary** of all created files and suggest the next step:
   > "Run `/grace:plan` to start the architectural planning phase."
