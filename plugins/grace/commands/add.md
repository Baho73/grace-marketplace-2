Add a new module to the project. Description: $ARGUMENTS

## Process

### Step 1: Understand Context
Read `docs/knowledge-graph.xml` to understand:
- What modules already exist
- What the new module will connect to
- What gap it fills

### Step 2: Design Contract
Propose a MODULE_CONTRACT for the new module:
- PURPOSE
- SCOPE
- DEPENDS (which existing modules)
- Key functions/components it will expose

**Present to user and wait for approval.**

### Step 3: Update Planning Artifacts
After approval:
1. Add the module to `docs/development-plan.xml` using unique ID-based tag: `<M-xxx NAME="..." TYPE="..." LAYER="N" ORDER="N">`. Use `<export-name>` for interface entries, `<step-N>` for pipeline steps. See CLAUDE.md "Documentation Artifacts" for full convention.
2. Add the module to `docs/knowledge-graph.xml` with unique ID-based tag: `<M-xxx NAME="..." TYPE="...">`. Use `<fn-name>`, `<type-Name>`, `<class-Name>` for annotation entries. Add CrossLinks to dependencies.

### Step 4: Generate Code
Follow the same generation protocol as `/grace:generate`:
- Full MODULE_CONTRACT header
- MODULE_MAP
- CHANGE_SUMMARY
- Contracts for each function/component
- Semantic blocks with unique names

### Step 5: Verify Integration
- Check that imports from existing modules resolve
- Run type checking or linting as appropriate for the project language
- Verify CrossLinks are bidirectionally consistent in the knowledge graph
