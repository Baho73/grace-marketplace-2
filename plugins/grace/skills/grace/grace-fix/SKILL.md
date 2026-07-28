---
name: grace-fix
description: "Отлаживает и исправляет проблемы в GRACE 4-проекте через семантическую навигацию `.grace`, assertions и свидетельства верификации. Использовать при багах и неожиданном поведении."
---

<skill>
<investigation_path>
1. Start from the failure, pasted error, failing command, or user report.
2. Load relevant `.grace/graph` module anchors and `.grace/verification` entries.
3. Check active `.grace/changes` for overlapping or stale planned work.
4. Inspect file-local contracts and semantic blocks before editing.
5. Identify root cause, present findings, then make the smallest safe fix.
</investigation_path>

<contradiction_resolution>
When the root cause is a genuine contradiction — fixing X breaks Y, two requirements or contracts pull in opposite directions — do not pick a side by taste. Invoke the local `triz` skill (MCP tools `triz_conflictoring` / `triz_resolve`) to formulate the contradiction and search for an injection that removes it instead of a compromise. Record the contradiction and the chosen injection in the fix's CHANGE_SUMMARY. If the triz toolset is unavailable in this session, state the contradiction explicitly and present both sides to the user instead of silently choosing.
</contradiction_resolution>

<verification>
Run the specific `V-M-*` commands or closest deterministic tests. If verification expectations are stale, update or propose changes through the GRACE 4 change lifecycle.
</verification>
</skill>
