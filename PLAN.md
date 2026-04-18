# GRACE Hardening Pass 1 — Development Plan

**Ветка:** `feature/hardening-pass-1`
**Baseline:** `baseline-v3.7.0` (git tag)
**Исходник идей:** сравнительный анализ с [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) + обратная связь от пользователя о том, что Claude Code забывает использовать GRACE.

---

## Цели

1. **Надёжность активации.** Гарантировать, что агенты не «забывают» GRACE — через meta-скил, SessionStart hook и автогенерируемый CLAUDE.md.
2. **Anti-rationalization дисциплина.** Внедрить во все 13 скилов паттерны из agent-skills: «Common Rationalizations», «When NOT to Use», evidence-driven verification.
3. **Усиление ключевых скилов.** Prove-It в `grace-fix`, 5-axis review в `grace-reviewer`, staged rollout в `grace-multiagent-execute`, phases-with-checkpoints в `grace-plan`, progressive disclosure в `grace-ask`.
4. **Reference-проект.** Сам этот репозиторий под управлением GRACE — станет живым integration-тестом и учебным примером.

---

## Out of scope (пока не трогаем)

- Расширение языковой поддержки CLI (Java/Go/Rust) — отдельная большая задача.
- Version-management контрактов (semver для PCAM) — требует отдельного дизайна.
- Partitioning knowledge-graph для монолитов — дизайн-исследование, не patch.
- Полная замена generic-скилов на GRACE-специфичные — philosophy conflict, не нужно.

---

## Repo-constraints (обязательны при каждом коммите)

Извлечены из `CLAUDE.md` и `scripts/validate-marketplace.ts`. Нарушение блокирует релиз.

1. **Canonical ↔ packaged зеркало.** Любое изменение в `skills/grace/<name>/` обязано быть скопировано в `plugins/grace/skills/grace/<name>/`. Валидация: `bun run ./scripts/validate-marketplace.ts`.
2. **Version sync.** Любое изменение, влияющее на релиз, обновляет версию в 4 местах: `README.md`, `package.json`, `openpackage.yml`, `.claude-plugin/marketplace.json`, `plugins/grace/.claude-plugin/plugin.json`.
3. **Shipped set.** Новый скил добавляется в `.claude-plugin/marketplace.json` (иначе он не попадёт в дистрибутив).
4. **CLI smoke.** После изменений CLI: `bun run grace lint --path . --allow-missing-docs` должен проходить.
5. **Tests.** `bun test` зелёный — hard gate на каждый коммит.

---

## Фазы

### Фаза 0 — Подготовка (1 коммит)

**Задачи**
- [x] Создать тег `baseline-v3.7.0`
- [x] Создать ветку `feature/hardening-pass-1`
- [x] Написать этот `PLAN.md`

**Acceptance:** `git tag --list baseline*` показывает baseline; `git branch --show-current` = feature/hardening-pass-1; PLAN.md в репо.

---

### Фаза 1 — Механизмы активации GRACE (приоритет P0)

**Проблема:** пользователь подтвердил, что Claude Code забывает вызывать GRACE. Без этой фазы все остальные доработки частично бесполезны.

#### 1.1. Meta-скил `using-grace`

Создать `skills/grace/using-grace/SKILL.md` по образцу superpowers `using-superpowers`:
- YAML frontmatter с description, построенным как обязательный триггер («Use when starting any conversation in a GRACE-managed project»)
- `<EXTREMELY-IMPORTANT>` блок с правилом: если в репо есть `docs/knowledge-graph.xml` или `AGENTS.md` с GRACE-маркерами — ОБЯЗАТЕЛЬНО загрузить контекст через `grace-status` или `grace-ask` ДО первого ответа
- Красные флаги (anti-rationalization table): «это простой вопрос», «я быстро посмотрю код», «сначала уточню у пользователя»
- Decision flowchart (как у superpowers): message → GRACE-проект? → да → активировать grace-status → отвечать

**Acceptance:** скил существует, описание триггерит активацию при запуске сессии в GRACE-проекте, содержит flowchart и rationalization-таблицу.

#### 1.2. SessionStart hook template

Добавить в `skills/grace/grace-init/assets/` шаблон `settings.json.template`, который `grace-init` копирует в `.claude/settings.json` целевого проекта:
```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "grace status --path . --format text --brief || echo 'GRACE: проект не инициализирован, запусти /grace-init'"
      }]
    }]
  }
}
```
- Нужно сначала добавить в CLI флаг `--brief` для короткого вывода (≤30 строк).

**Acceptance:** шаблон существует; `grace-init` умеет его копировать; `grace status --brief` работает.

#### 1.3. Автогенерация CLAUDE.md целевым `grace-init`

Обновить `grace-init`: при инициализации создавать в корне целевого проекта `CLAUDE.md` (или дополнять существующий) с жёстким preamble:
```markdown
# Project uses GRACE

<CRITICAL>
Before editing any code, you MUST:
1. Read docs/knowledge-graph.xml to locate affected modules
2. Invoke the appropriate grace-* skill (grace-fix / grace-execute / grace-refactor)
3. Never bypass semantic markup (START_BLOCK/END_BLOCK) — update it in the same commit
</CRITICAL>

Artifacts:
- docs/knowledge-graph.xml — module graph (source of truth)
- docs/development-plan.xml — plan and contracts
- docs/verification-plan.xml — tests, traces, log markers
```

**Acceptance:** `grace-init` в новом проекте создаёт/апдейтит CLAUDE.md; текст содержит `<CRITICAL>` блок; раздел artifacts перечисляет XML-файлы.

---

### Фаза 2 — Paзметка всех 13 скилов (приоритет P1)

Применить ко **всем** существующим скилам три обязательные секции. Делаем одним sweep, по одному коммиту на скил.

#### 2.1. `## Common Rationalizations`
Таблица «оправдание → реальность» для частых попыток агента пропустить работу скила. Минимум 4 строки на скил. Примеры:

Для `grace-plan`:
| Rationalization | Reality |
|---|---|
| «Архитектура очевидна, план не нужен» | Очевидное может быть неверным. План — и есть верификация. |
| «Отрефакторим границы потом» | Границы — это контракты. Рефакторинг границ позже ломает зависимых агентов. |

Для `grace-fix`:
| Rationalization | Reality |
|---|---|
| «Исправление тривиальное, тест не нужен» | Тривиальные багы возвращаются. Без регрессионного теста этот баг починен временно. |
| «Воспроизведу в голове» | Если не воспроизведён в коде — не доказан. |

#### 2.2. `## When NOT to Use`
Явный список анти-триггеров. Предотвращает over-application. Примеры:
- `grace-refactor` — не для правки одной строки или опечатки в комментарии
- `grace-plan` — не для bug fix с clear root cause (используй `grace-fix`)
- `grace-multiagent-execute` — не для линейных задач с 1-2 шагами

#### 2.3. `## Verification` (evidence-driven)
Заменить абстрактные «ensure quality» на проверяемые чек-листы:
```markdown
## Verification

After completing this skill:
- [ ] `grace lint --path .` exits 0 (команда)
- [ ] Affected module appears in knowledge-graph.xml (команда: `grace module show <id>`)
- [ ] New/changed blocks have START_BLOCK/END_BLOCK markers (команда: `grep -c`)
- [ ] verification-plan.xml обновлён для изменённых модулей
```

**Acceptance:** все 13 SKILL.md содержат три секции; каждая проверка — выполнимая команда, не прозаическое описание.

---

### Фаза 3 — Усиление 5 ключевых скилов (приоритет P1)

#### 3.1. `grace-fix` ← Prove-It Pattern
Переструктурировать workflow:
1. Locate: найти баг по knowledge-graph + semantic blocks (текущая логика остаётся)
2. **Prove** (NEW): написать failing test против текущего кода
3. Fix
4. **Verify** (NEW): test становится passing
5. **Guard** (NEW): добавить regression entry в verification-plan.xml
6. Commit test+fix одним коммитом

**Acceptance:** SKILL.md включает Prove→Fix→Verify→Guard; rationalization запрещает «skip test because trivial».

#### 3.2. `grace-reviewer` ← 5-axis review
Добавить explicit оси с чек-листами:
1. **Completeness** — knowledge-graph покрывает все изменённые модули?
2. **Contractual Adherence** — PCAM контракты актуальны? Metrics собираются?
3. **Semantic Clarity** — START_BLOCK/END_BLOCK консистентны, размер ~500 токенов?
4. **Verification Coverage** — изменённые пути покрыты verification-plan?
5. **Graph Integrity** — нет циклов, orphan-модулей, битых CrossLink?

Каждая ось — severity label (Critical/Important/Suggestion/FYI) как у Addy.

**Acceptance:** SKILL.md перечисляет 5 осей; каждая имеет чек-лист и severity table.

#### 3.3. `grace-multiagent-execute` ← staged rollout + pre-wave checklist
Добавить **Wave Success Thresholds**:

| Metric | Advance | Hold | Rollback |
|---|---|---|---|
| Lint pass rate | 100% | 95-99% | <95% |
| Tests pass | 100% | ≥1 flaky | ≥1 hard fail |
| Graph consistency | valid | warnings | errors |
| Verification coverage новых модулей | ≥80% | 60-79% | <60% |

Добавить **Pre-Wave Checklist** (до запуска следующей волны):
- [ ] Reviewer одобрил предыдущую волну
- [ ] knowledge-graph.xml валиден (`grace lint`)
- [ ] PCAM определены для всех модулей волны
- [ ] verification-plan обновлён

**Acceptance:** SKILL.md содержит thresholds-таблицу и pre-wave checklist; decision model explicit (не «proceed if looks good»).

#### 3.4. `grace-plan` ← phases with checkpoints + dependency discipline
- Генерируемый development-plan.xml структурируется фазами (Phase 1..N), каждая фаза завершается checkpoint-блоком (all contracts reviewed, tests green, graph updated).
- Перед добавлением нового модуля/зависимости агент обязан: поиск дубликата в graph (`grace module find`), оценка size/maintenance/license, запись обоснования в план.

**Acceptance:** шаблон `development-plan.xml.template` содержит структуру phases+checkpoints; SKILL.md описывает dependency-discipline алгоритм.

#### 3.5. `grace-ask` ← progressive disclosure
Добавить context hierarchy:
- **Level 1 (always)**: AGENTS.md + CLAUDE.md
- **Level 2 (per feature)**: релевантная секция development-plan.xml
- **Level 3 (per task)**: релевантная секция knowledge-graph.xml + semantic blocks модулей
- **Level 4 (on demand)**: verification-plan.xml полностью

SKILL.md предписывает: начинать с Level 1, повышать уровень только при недостатке контекста. Логировать в ответе какой уровень загружен.

**Acceptance:** SKILL.md описывает 4 уровня и правила повышения; пример диалога включает явное «loading Level 2».

---

### Фаза 4 — CLI support для новых паттернов (приоритет P2)

#### 4.1. `grace status --brief`
Короткий (≤30 строк) вывод для SessionStart hook:
- Наличие артефактов (graph, plan, verification)
- Количество модулей, покрытие verification, last-updated timestamps
- Следующее рекомендуемое действие одной строкой

**Acceptance:** команда реализована, есть snapshot-тест вывода.

#### 4.2. `grace lint` — новые правила
- Проверка наличия секций `## Common Rationalizations`, `## When NOT to Use`, `## Verification` в SKILL.md (configurable, non-fatal warning)
- Проверка что verification-plan упоминает каждый модуль из knowledge-graph

**Acceptance:** новые правила конфигурируются через `.grace-lint.json`; тесты покрывают happy path и отсутствующие секции.

---

### Фаза 5 — Reference-проект и конвертация плана в GRACE-формат (приоритет P2)

После завершения фаз 1-4:
- Применить `grace-init` к самому репо
- Конвертировать этот `PLAN.md` в `docs/development-plan.xml` + `docs/verification-plan.xml` + `docs/knowledge-graph.xml`
- Добавить в README раздел «This repository is self-managed with GRACE»

**Acceptance:** репо проходит `grace lint --path .` без ошибок; граф содержит модули для CLI и каждого скила.

---

## Порядок выполнения

| Шаг | Что | Скилы/файлы | Зависимости |
|---|---|---|---|
| 0 | PLAN.md + baseline | этот файл | — |
| 1 | Фаза 1.1 using-grace | `skills/grace/using-grace/SKILL.md` | 0 |
| 2 | Фаза 1.2 SessionStart + `--brief` | `grace-cli`, `grace-init/assets` | 1 |
| 3 | Фаза 1.3 CLAUDE.md автоген | `grace-init` | 2 |
| 4 | Фаза 2 разметка 13 скилов | все `skills/grace/*/SKILL.md` | 1 |
| 5 | Фаза 3.1 grace-fix Prove-It | `grace-fix` | 4 |
| 6 | Фаза 3.2 grace-reviewer 5-axis | `grace-reviewer` | 4 |
| 7 | Фаза 3.3 multiagent-execute thresholds | `grace-multiagent-execute` | 4 |
| 8 | Фаза 3.4 grace-plan phases | `grace-plan`, template | 4 |
| 9 | Фаза 3.5 grace-ask disclosure | `grace-ask` | 4 |
| 10 | Фаза 4.1 `grace status --brief` | CLI `src/` | 2 (уже проделан) |
| 11 | Фаза 4.2 lint rules | CLI `src/lint/` | 4 |
| 12 | Фаза 5 reference-проект | `docs/*.xml` | 1-11 |

Коммиты: один логический шаг — один коммит. Тесты CLI обязательны в шагах 10-11.

---

## Критерии завершения hardening-pass-1

- Все 13 скилов имеют три новые секции (Rationalizations, When NOT, Verification).
- 5 ключевых скилов усилены по фазе 3.
- Meta-скил `using-grace` создан и работает как активатор.
- `grace status --brief` встроен в SessionStart через `grace-init`.
- Репо управляется GRACE (фаза 5).
- `bun test` зелёный, `grace lint` зелёный.
- PR-description документирует каждую фазу с примерами до/после.

---

## Следующие PR / Future work

### PR-2: `grace-evolve` — автономный evolutionary-search скил

**Мотивация:** LLM-выбор (модель, архитектурный подход, алгоритм, промпт) часто субоптимален и требует ручного перебора. Идея — автономный ночной run, который генерирует, тестирует и улучшает варианты, расширяя search-space в процессе.

**Prior art:** DeepMind FunSearch / AlphaEvolve, Sakana AI Scientist, Weco AIDE, ShinkaEvolve — уже доказали, что LLM + evaluator loop открывает нетривиальные решения.

**Состав скила (draft):**
1. **Problem spec** — что оптимизируем (архитектура / алгоритм / prompt / model choice / bundle).
2. **Metrics contract** — ≥2 ортогональные измеримые метрики (защита от Goodhart's law).
3. **Eval harness** — команда, запускающая кандидата и возвращающая числа. Использует существующий `verification-plan`.
4. **Initial generator** — N (4-8) **структурно разных** подходов (не вариации параметров).
5. **Candidate runner** — каждый кандидат в отдельном git worktree (изоляция обязательна для ночного run'а). Фиксация seed / deps / env snapshot.
6. **Critic loop** — LLM читает логи + результаты + official docs (через source-driven-подход), генерирует новые кандидаты в обнаруженные slot'ы.
7. **Archive** — `docs/experiments/<topic>/results.xml`: все попытки, метрики, jury-rationale, diffs. Становится teaching material и аудитом.
8. **Stopping** — budget exhausted / target metric hit / convergence detected.
9. **Output** — ADR + обновление `development-plan.xml` + winning implementation в main.

**Budget control (обязательная часть дизайна):**

| Параметр | Default | Обоснование |
|---|---|---|
| Hard cap: 5-hour limit | 100% от 5-часовой квоты Claude Code | одна ночная сессия не должна превышать rate-limit окна |
| Hard cap: weekly | ≤20% от недельного лимита | оставляет запас на обычную работу |
| Adaptive cap | `min(0.20 × weekly_total, 0.50 × weekly_remaining)` | чем меньше осталось — тем меньше тратим за раз |
| Per-candidate cap | configurable (default: 5% от session budget) | защита от одного кандидата, съевшего всё |
| Early-stop | если прогресса по метрике нет N итераций подряд | anti-divergence |

Пример пользовательского сценария: «осталось 11% недельных до среды» → adaptive cap = min(20% × total, 50% × 11%) = 5.5% → скил запрашивает explicit approval, если плановый run превышает этот потолок.

**Safety:**
- Worktree read-write only inside isolated branch.
- Hard-deny external side-effects (push, deploy, network calls кроме whitelisted docs).
- Human-gate перед применением winning solution в main.

**Зависимости:** hardening-pass-1 (нужен `grace-multiagent-execute` с thresholds + progressive disclosure из `grace-ask`).

**Ветка:** `feature/grace-evolve` (после мерджа `feature/hardening-pass-1`).

**Отдельный brainstorm-сессии требуют:** eval harness design, budget-controls implementation, archive schema, safety boundaries.

### PR-3: `grace-afk` — harness для автономной работы «пока пользователь ушёл»

**Мотивация:** пользователь ушёл на обед / лёг спать / улетел — Claude должен не простаивать, а двигать план вперёд, принимая решения от имени пользователя в очерченных границах. При реально неразрешимом вопросе — эскалировать в Telegram коротким сообщением, не простынёй. Hardening-pass-1 был ручной прототип этого workflow (пользователь ушёл AFK на ~2h, вернулся к готовому PR).

**Это harness-команда / meta-skill**, не GRACE-скил. Композирует `grace-evolve`, `grace-execute`, `grace-multiagent-execute`, `grace-ask-human` (Telegram-обёртка) поверх встроенного `/loop`.

**Синтаксис:**

```
/afk [hours] [budget%] [--checkpoint <min>]
```

Defaults:
- `hours` = 2
- `budget%` = `min(25% weekly, 100% текущего 5h-окна)` — консервативно если не задано
- `--checkpoint` = 30 min на старте; **адаптивный**: N зелёных тиков подряд → растягиваю до 60-120 min, первый yellow/red → возврат к 30 min

Примеры:
- `/afk` → 2h, дефолт-бюджет, 30-мин чекпоинты
- `/afk 16` → overnight, дефолт-бюджет
- `/afk 16 50` → 16h, до 50% недельных
- `/afk 16 50 --checkpoint 45` → всё выше + 45-мин чекпоинты

**Оба cap'а работают одновременно** — какой hit первым, тот и стоп. Это прямо отражает сценарий пользователя «осталось 11% недельных до среды, могу 20% сжечь».

**Компоненты:**

1. **Start gate** — тег `afk-baseline-<ts>` + ветка `afk-<ts>`. Main NEVER touched. Один `git reset --hard afk-baseline-<ts>` откатывает всё.
2. **Budget reasoner** — вычисляет token cap из обоих параметров; emergency kill при превышении.
3. **Autonomy matrix** — см. ниже.
4. **Loop engine** — встроенный `/loop` с динамическим pacing'ом: каждый тик берёт следующий pending step из `docs/development-plan.xml`, прогоняет через autonomy matrix, выполняет или делегирует.
5. **Evolve bridge** — при uncertainty запускает `grace-evolve` с micro-budget (≤10% оставшегося бюджета сессии) на 3-5 кандидатов; winner коммитится.
6. **Telegram escalation** — см. ниже.
7. **Decision journal** — `docs/afk-sessions/<ts>/decisions.md` + `deferred.md`.
8. **Return dashboard** — итоговый summary при истечении hours или возврате пользователя.

**Autonomy matrix (главная часть дизайна):**

| Класс решения | Действие |
|---|---|
| Обратимые: код / тесты / XML / доки / коммиты в feature branch | **Act** — принимаю сам |
| Архитектурный выбор с ≥2 правдоподобными подходами | **Delegate to `grace-evolve`** |
| Необратимые one-way-door: push на main, force push, drop DB, rm -rf, deploy, billing, external API с side-effects | **Escalate Telegram** → fallback: defer |
| Смена scope (начал с bug fix, хочется refactor всего модуля) | **Defer** (always) |
| Wave threshold YELLOW | Rollback + следующая задача |
| Wave threshold RED | Stop + emergency Telegram |

Правило anti-Goodhart: если решение one-way door — никогда не принимаю сам, даже если subjectively «уверен». «≥2 правдоподобных подхода с разными tradeoff'ами» — жёсткий, а не «на вибах», критерий для delegation в evolve.

**Telegram escalation (`grace-ask-human` скил):**

- Транспорт: **MCP telegram** (если подключён). Fallback при отсутствии: defer в `deferred.md` без прерывания работы.
- **Не строим свой бот** в этом репо — меньше инфры, меньше точек отказа.
- Triggers **только** для one-way-door / RED-threshold / emergency. Обратимые решения — никогда.

Жёсткий формат сообщения:

```
/afk требует решения (session <ts>)

Ситуация: <1 предложение>
Варианты:
  A — <1 строка>
  B — <1 строка>
  C — <1 строка>
Моя версия: B (уверенность 60%)
Ответь: A / B / C / proceed / stop / evolve
```

Polling schedule: send → check через 10 / 30 / 60 / 120 min (backoff). Без ответа 2h → fallback: `grace-evolve` если uncertain, иначе defer + следующая задача. Защита от «бот дёргает каждые 10 минут» — hard cap: не более 3 Telegram-эскалаций за сессию.

**Safety layer (обязательная часть дизайна):**

- Работа только на ветке `afk-<ts>`; main / feature/* неприкосновенны.
- Hard-deny: `git push --force`, `git push` на main, `rm -rf`, network кроме whitelisted docs, любые external side-effects (Slack, email, deploy, billing, payment API).
- Emergency checkpoint каждые 90 мин независимо от adaptive cadence — сохранение состояния на случай abrupt interrupt.
- Wave-thresholds из `grace-multiagent-execute` применяются на каждый тик.
- **Kill switch:** пользователь может прислать `STOP` в Telegram → агент завершает текущий коммит и выходит с финальным dashboard.

**Checkpoint cadence (адаптивный):**

| Состояние | Интервал | Переход |
|---|---|---|
| Стартовое | 30 min | после 3 green тиков → 60 min |
| После 3 green @ 30min | 60 min | после 3 green @ 60min → 120 min |
| После 3 green @ 60min | 120 min | yellow/red → возврат к 30 min |
| После yellow/red | 30 min | повтор цикла |

На каждом чекпоинте: `grace status --brief`, `bun test`, `grace lint`, запись в decision journal, проверка budget consumption.

**Decision journal format (`docs/afk-sessions/<ts>/decisions.md`):**

Каждое решение = ExecutionPacket-like запись:
```
## <ts> decision <N>
Class: reversible | uncertain-evolve | one-way-deferred | threshold-rollback
Context: <development-plan step ref>
Options considered: [A, B, C]
Chosen: B
Rationale: <1-2 sentence>
Evidence: <test output / metric / grace lint exit>
Outcome: <commit hash | evolve session ref | deferred.md#N>
```

Плюс `deferred.md` со списком вопросов для возврата пользователя — одна строка на вопрос + ссылка на контекст.

**Return dashboard (при возврате / истечении):**

```
/afk session 2026-04-18T22:00 complete
Duration:    6h 12m of 16h budget
Tokens:      18% of weekly (cap was 50%)
Commits:     14 on branch afk-20260418T2200
Evolve runs: 2 (1 winner merged, 1 archived as inferior)
Deferred:    3 decisions (see docs/afk-sessions/.../deferred.md)
Escalations: 1 Telegram (answered: proceed)
Changed:    47 files, +2103 -189 lines
All gates:   green (bun test, validate-marketplace, grace lint)
Recommended next:
  1. Review deferred.md
  2. Merge afk-20260418T2200 into feature/<name>
  3. Delete afk branch after merge
```

**Зависимости:**
- PR-2 `grace-evolve` (нужен как bridge для uncertainty)
- hardening-pass-1 (wave thresholds в `grace-multiagent-execute`, progressive disclosure в `grace-ask`)
- MCP telegram (или аналогичный транспорт) — опционально, fallback работает без него

**Ветка:** `feature/grace-afk` (после `feature/grace-evolve`).

**Отдельный brainstorm-сессии требуют:**
- Точная калибровка «uncertainty threshold» → evolve (ложно-уверенные решения = главный риск)
- Полный hard-deny list команд для safety layer
- Протокол `STOP` kill switch (что именно сохраняется, как очищается состояние)
- Формат `grace-ask-human` (может быть отдельный sub-skill)

### PR-4+: backlog

- CLI: адаптер для Java/Go/Rust (role-aware lint)
- PCAM semver: версионирование контрактов с breaking-change signaling
- Knowledge-graph partitioning для монолитов (>1000 модулей)
- `grace-ask-human` как standalone скил (если Telegram-обёртка вырастет за пределы PR-3)

---

## Открытые вопросы к пользователю

1. **Именование**: устраивает `using-grace` для meta-скила или переименовать (`grace-bootstrap`, `grace-activator`)?
2. **Hook-agressiveness**: делаем только SessionStart (мягкий) или добавляем PreToolUse hook для блокировки Edit/Write без загруженного GRACE-контекста (жёсткий)?
3. **Фаза 5**: делать reference-проект в том же PR или отдельным follow-up?
4. **Upstream-трекинг**: добавить `upstream` remote на оригинал Baho73 для будущих update'ов?
5. **`grace-evolve` budget**: устраивают defaults 20% weekly / 100% 5h / adaptive по remaining, или нужны другие пороги?
6. **`grace-afk` uncertainty threshold**: чем точно отличается «я уверен, действую» от «неуверен, в evolve»? Требует калибровки — обсудить в отдельной сессии перед имплементацией PR-3.
7. **`grace-afk` kill-switch protocol**: достаточно `STOP` в Telegram или нужен web-dashboard для интерактивного управления?
