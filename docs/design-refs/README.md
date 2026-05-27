# Design References (ground truth)

**Дата:** 2026-05-25
**Источник:** standalone HTML мокапы R1-R6 Maritime Deep, переданные основателем как «прод должен выглядеть так же».

Каждый файл — Claude Bundler standalone HTML (~250KB): SVG-плейсхолдер + JS-bundle, который рендерит React-компонент при открытии в браузере. Текстовый grep не работает — нужен браузер (двойной клик / `open <file>`) или Chrome MCP с `file://` URL.

## Соответствие страница → файл → роут на проде

| Файл | Прод-роут | Что показывает |
|------|-----------|----------------|
| `landing.html` | `/` (unauth) | Public landing с product-demo hero |
| `dashboard.html` | `/` (auth) или `/dashboard` | Agenda-first + KPI strip |
| `matches.html` | `/matches` | Table-first + LiveStrip + filters |
| `match-detail.html` | `/match/[id]` | Split layout + sticky AI side-panel |
| `cargo.html` | `/cargo` | Table + AI-add bar + side-modal |
| `charterers.html` | `/charterers` | Table + Last-snippet + HOT/WARM/COLD |
| `market.html` | `/market` | Multi-section digest |

## Как использовать

**Разработчик:** двойной клик по файлу → откроется в браузере, увидишь точный целевой дизайн. Сравнивай с тем что сейчас на demo.quantika.org. Реализуй несоответствие.

**QA (`/qa-walker`):** скилл автоматически открывает референс через `file://` URL в Chrome MCP и снимает скриншот рядом с прод-страницей. Расхождения попадают в bug buffer (severity high) под классом «D. Reference divergence». См. Phase 2.7 в `~/.claude/skills/qa-walker/SKILL.md`.

## Что НЕ покрыто этими референсами

Эти 7 файлов — основные broker-screens. Остальные R5-страницы (Recap / Email / Settings / Laytime / PSC / Commission / Clauses / Request / Processing / Vessel detail / Fixture / Upgrade / Onboarding / Notifications / Help) пока валидируются по spec §5a (`docs/superpowers/specs/2026-05-24-quantika-demo-full-redesign-design.md`), не по pixel-перфект референсу.

## Не редактируй файлы вручную

Эти HTML — output Claude Artifact bundler'а, byte-for-byte. Любая правка ломает JS-распаковку и страница не отрендерится. Если дизайн меняется — новый Artifact, перезаливай файл целиком.
