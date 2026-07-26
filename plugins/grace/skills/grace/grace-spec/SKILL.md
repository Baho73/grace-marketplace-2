---
name: grace-spec
description: "Интервьюирует пользователя и создаёт одобренную GRACE 4 GraceChangeSpec плюс опциональный design-context.xml в `.grace/changes/active/C-*/`. Использовать в начале любого изменения."
---

<skill>
<change_bundle_contract>
`.grace/changes/active/C-CHANGE-ID/`

- `spec.xml` — normative `GraceChangeSpec`
- `design-context.xml` — optional, explanatory only
- `plan.xml` — created later by `grace-plan`
</change_bundle_contract>

<status_rules>
Create `spec.xml` as `status="draft"`. Set `status="approved"` only after explicit user approval. Rejected or cancelled specs move to archive with terminal status. Do not create or edit `plan.xml` in this skill.
</status_rules>

<strict_contract>
The direct `C-*` wrapper must contain exactly one meaningful `Summary`, `Goals`, `Constraints`, `NonGoals`, `AcceptanceCriteria`, `AffectedAreas`, and `VerificationIntent` section. Empty containers are not approval-ready. Semantic anchors are canonical attribute-free XML tags, never attributes or attribute values.
</strict_contract>

<workflow>
1. Ask one focused question at a time until goal, scope, constraints, non-goals, acceptance criteria, affected areas, and verification expectations are clear.
2. Propose a concise design summary and explicit assumptions. Ask for approval before writing an approved spec.
3. Create a deterministic uppercase-kebab `C-*` change id.
4. Write `spec.xml` from `references/change-spec-template.xml` with exactly one direct `C-*` wrapper and no empty required section.
5. If rationale, alternatives, scenarios, or external constraints would otherwise bloat the spec, write non-normative `design-context.xml` from its template.
6. If approval is not explicit, leave `spec.xml` as `status="draft"` and report the approval step needed.
</workflow>

<hard_rules>
- `spec.xml` is the source of truth for `grace-plan`; design context never adds requirements.
- Do not implement code, mutate current graph/verification state, or create retroactive change bundles.
- Recommend `grace lint --path <project-root> --assertions current` after writing the bundle.
</hard_rules>
</skill>
