Answer a question about the current GRACE project. Input: $ARGUMENTS (the user's question)

## Process

### Step 1: Load Project Context
Read the following files (skip any that don't exist):
1. `CLAUDE.md` — project principles and conventions
2. `docs/knowledge-graph.xml` — module map, dependencies, exports
3. `docs/requirements.xml` — use cases and requirements
4. `docs/technology.xml` — stack, runtime, libraries
5. `docs/development-plan.xml` — phases, modules, contracts

### Step 2: Identify Relevant Modules
Based on the question, find the most relevant modules:
1. Use the knowledge graph to locate modules related to the question
2. Follow CrossLinks to find connected modules
3. Read MODULE_CONTRACTs of relevant modules for detailed context

### Step 3: Dive Into Code If Needed
If the question is about specific behavior or implementation:
1. Use MODULE_MAP to locate relevant functions/blocks
2. Read the specific START_BLOCK/END_BLOCK sections
3. Read function CONTRACTs for intent vs implementation details

### Step 4: Answer
Provide a clear, concise answer grounded in the actual project artifacts. Always cite which files/modules/blocks your answer is based on.

### Important
- Never guess — if the information isn't in the project artifacts, say so
- If the question reveals a gap in documentation or contracts, mention it
- If the answer requires changes to the project, suggest the appropriate `/grace:*` command
