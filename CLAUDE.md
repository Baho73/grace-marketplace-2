# Repository Context

This repository is the GRACE marketplace package, not an end-user application.

GRACE means Graph-RAG Anchored Code Engineering: a contract-first AI engineering methodology built around semantic markup, XML planning artifacts, knowledge-graph navigation, and verification/log-driven execution.

## What This Repo Contains

- `skills/grace/*` contains the canonical skill sources.
- `plugins/grace/skills/grace/*` contains the packaged mirror used for Claude marketplace/plugin distribution.
- `.claude-plugin/marketplace.json` defines the marketplace entry.
- `plugins/grace/.claude-plugin/plugin.json` defines the packaged plugin manifest.
- `openpackage.yml` defines OpenPackage metadata.
- `README.md` is the user-facing overview and install guide.
- `package.json`, `src/grace.ts`, and `src/grace-lint.ts` define the published Bun-powered CLI package `@osovv/grace-cli` and the `grace lint` command.
- `scripts/validate-marketplace.ts` validates packaging, path safety, version sync, and packaged-vs-canonical drift.

## Core Purpose

The repository packages and distributes GRACE skills so coding agents can:

- initialize GRACE project artifacts
- plan module architecture and contracts
- design verification and log evidence
- execute plans sequentially or in parallel-safe waves
- inspect project health, refresh drift, review integrity, explain GRACE, and answer project questions

This repo is mainly about methodology content, skill instructions, and marketplace packaging.

## Important Working Rules

- Treat `skills/grace/*` as the main source of truth unless a task is explicitly about packaged output.
- Keep `plugins/grace/skills/grace/*` synchronized with the canonical `skills/grace/*` copies when published skills change.
- Keep versions synchronized across `README.md`, `openpackage.yml`, `.claude-plugin/marketplace.json`, and `plugins/grace/.claude-plugin/plugin.json`.
- Validate repo integrity with `bun run ./scripts/validate-marketplace.ts` after packaging or metadata changes.
- For CLI changes, run `bun run validate:cli` and exercise `grace lint` against a complete temporary or fixture GRACE 4 project. This packaging repository does not yet contain its own `.grace` state, so `bun run grace lint --path .` is expected to report `project.missing-grace` until a separate self-migration is approved.
- Do not assume every directory under `skills/grace/` is published; the actual shipped set is declared in `.claude-plugin/marketplace.json`.

## TODO: зелёный `grace lint` не означает согласованность

Найдено на боевом проекте под управлением GRACE 4 (тестовое задание РУСАЛ, июль 2026). Дважды подряд `grace lint` показывал **0 ошибок** и `grace status` — **нулевой дрейф**, при этом durable-состояние реально расходилось с кодом. Оба раза находки дала ручная сверка, а не CLI. Вывод: сейчас lint проверяет грамматику, проекции и разметку, но **не полноту и не свежесть**.

Три дыры, которые стоит закрыть в `src/grace-lint.ts`:

1. **Файл с семантической разметкой, которого нет в графе.** Модуль `sanitizer/report.py` имел полный `START_MODULE_CONTRACT`, но узла `M-REPORT` в `.grace/graph` не было — файл создан после архивации бандла. Lint промолчал.
   *Правило:* если файл содержит `START_MODULE_CONTRACT`, но ни один `<Path>` в графе на него не указывает — **error** (`graph.unanchored-governed-file`). Обратная проверка (`<Path>` указывает на несуществующий файл) тоже нужна.

2. **Протухшие свидетельства верификации.** Шесть записей `V-M-*` заявляли старые числа (`2 passed` при фактических 8) и не знали о пяти новых тестовых файлах. Свидетельство, которое расходится с реальностью, хуже отсутствующего: оно создаёт ложную уверенность.
   *Правило:* хотя бы **warning** `verification.stale-evidence`, когда `<Evidence>` содержит счётчики или имена файлов, не подтверждаемые текущим прогоном/деревом. Минимальная версия без запуска тестов: сверять упомянутые в `<Command>`/`<Evidence>` пути с существующими файлами.

3. **`--assertions final --run-commands` не исполняет пофайловые команды задач.** Гейт прогоняет только целевой `MustPassCommand`. В плане `C-MVP-SANITIZER` пять задач ссылались на тесты (`tests/unit/test_cli.py`, четыре интеграционных), которых **не существовало** — задачи прошли, гейт зелёный, дыра в покрытии осталась. Обнаружилось только при ручном составлении отчёта по V-модели.
   *Правило:* на финальном гейте проверять, что все пути из `<Verification><Command>` каждой задачи существуют — **error** `plan.verification-command-missing-target`. Опционально — флаг `--run-task-commands` для фактического исполнения.

Общий принцип для формулировки в доках: **зелёный lint — необходимое, но не достаточное условие.** Пока правила выше не реализованы, стоит явно написать в `grace-reviewer` и `grace-status`, что ручная сверка «граф ↔ файлы с разметкой» и «свидетельства ↔ фактический прогон» остаётся обязательным шагом ревью.

## TODO: встроить V-модель как проекцию `.grace`

Оттуда же (РУСАЛ, июль 2026). Отчёт «модули × V-модель» пришлось собирать **вручную** — и именно ручная сборка вскрыла три дефекта, которые не увидел ни один прогон CLI (см. TODO выше). Но почти все данные для этой матрицы **уже лежат в `.grace`**: её надо не писать, а выводить.

Предлагаемая команда: `grace vmodel --path .` (или `grace status --v-model`), на выходе — `docs/module-status.md`.

Откуда берётся каждая колонка:

| Колонка V-модели | Источник в `.grace` | Готовность |
|---|---|---|
| **Потр** — потребности | `context/requirements.xml` → `<Goals>`, `<Users>` | есть |
| **Треб** — требования | `changes/*/spec.xml` → `<Goals>`, `<AcceptanceCriteria>` | есть |
| **Арх** — архитектура | `graph/*.xml` → узел `M-*` существует, `<DependsOn>` заполнен | есть |
| **Кнтр** — контракты | `START_MODULE_CONTRACT` + `START_CONTRACT:` в файле модуля | есть (уже парсится линтом) |
| **Код** | `<Path>` указывает на существующий файл | есть |
| **Unit / Интг / Сист** | `verification/*.xml` → `<Command>`: разложить по каталогам `unit/`, `integration/`, `e2e/` | **нужна конвенция**: сейчас уровень теста нигде не размечен |
| **Вриф** — верификация | `plan.xml` → `TargetAssertions`, критерии спеки: измерены или только объявлены | **нужен признак**: сейчас нельзя отличить «критерий измерен» от «критерий записан» |
| **Влд** — валидация | **источника нет вообще** | **дыра в модели** |

Три вывода, по возрастанию важности:

1. **Уровень теста стоит размечать явно.** Добавить в `verification/*.xml` атрибут-тег уровня (`<Level>unit\|integration\|system</Level>`) вместо угадывания по пути. Тогда правая ветвь V строится детерминированно.

2. **Критерий приёмки должен уметь быть «объявленным» и «измеренным».** Сейчас `AcceptanceCriteria` — просто текст, и спека одинаково выглядит до и после проверки. На практике из 15 критериев §7 пять так и остались декларациями, и заметить это можно было только глазами. Нужен статус на критерий (`declared` / `measured` + значение) — тогда `Вриф` считается автоматически, а гейт может требовать «нет критериев в статусе declared».

3. **В GRACE нет понятия валидации.** Методология целиком про верификацию — «сделали ли по контракту». Вопрос «решили ли задачу пользователя» не представлен ни одним артефактом: нет ни пользовательских историй, ни признака, что кто-то реально воспользовался результатом. На боевом проекте это дало ровно тот перекос: левая ветвь V закрыта, верификация зелёная, а столбец «Влд» пустой целиком — и обнаружилось это только при ручном рисовании матрицы.
   *Минимальный шаг:* секция `<UserStories>` в `context/requirements.xml` (UC, история, стадия) и ссылка на неё из `spec.xml`. Тогда «Влд» перестаёт быть невидимым и начинает мозолить глаза — как и должно.

Пример готового отчёта, по которому удобно проектировать формат: `D:\Python\RUSAL_test\docs\module-status.md` (матрица, таблица измеренных критериев, User Stories, «Главный разрыв»). Правила его составления — `C:\Users\Ivan\.claude\docs\dev-status-report-rules.md`.

## How To Think About Changes

- Skill text changes are product changes.
- Packaging/manifests/metadata changes are release-surface changes.
- Validation changes protect against drift between canonical skills and packaged copies.
- README and changelog updates are part of release hygiene, not optional polish.

## Default Mental Model For Future Sessions

If a request is ambiguous, assume the user is working on one of these areas:

- refining GRACE methodology instructions
- adding or updating a skill
- fixing packaging/marketplace installation
- maintaining the published `grace` CLI and its lint workflow
- keeping canonical and packaged skill trees in sync
- tightening verification around releases
