# Task Division Plan — Quantika Demo Audit Fixes (v4)

## Overview

Исправление 8 багов и реализация недостающих фич, выявленных аудитом demo.quantika.org от 2026-04-10. Core приложения (парсинг, матчинг, commission) работает стабильно. Нужно добавить: Rate Intelligence, TCE калькулятор, Laytime, FCL/LCL модуль, Subs timer, Time Charter классификацию, multi-currency, fix geared/gearless.

Исходники: VPS `/root/quantika-demo`
Стек: Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, OpenAI SDK → CLIProxy
Тесты: `npm test` + `scripts/smoke-test.sh`
Deploy: PM2 + Caddy

## Specs Summary

| # | Name | Batch | Depends | Files | Est |
|---|------|-------|---------|-------|-----|
| 00 | Foundation types + currency utils | 0 | — | 4 | 15m |
| 01 | Parser fixes (geared + TC type) | 1 | 00 | 4 | 20m |
| 02 | Rate Intelligence in Draft Quote | 1 | 00 | 5 | 25m |
| 03 | Currency EUR→USD in commission | 1 | 00 | 4 | 20m |
| 04 | Subs timer in fixture recap | 1 | 00 | 5 | 25m |
| 05 | TCE/Voyage Calculator page | 2 | 00 | 6 | 30m |
| 06 | Laytime Calculator widget | 2 | 00,04 | 5 | 25m |
| 07 | FCL/LCL module + sample data | 2 | 00 | 7 | 30m |
| 08 | Integration wiring + smoke tests | 3 | all | 4 | 20m |

## Dependency Graph

```
[spec-00] ──┬──> [spec-01] ──────────────────┐
            ├──> [spec-02] ──────────────────┤
            ├──> [spec-03] ──────────────────┤
            ├──> [spec-04] ──┬──> [spec-06]  ├──> [spec-08]
            ├──> [spec-05] ──┤               │
            └──> [spec-07] ──────────────────┘
```

## Execution Plan

### Batch 0: Foundation (1 session, ~15 min)
- [ ] spec-00-foundation → session 1

### Batch 1: Core fixes (4 parallel sessions, ~25 min)
- [ ] spec-01-parser-fixes → session 1
- [ ] spec-02-rate-intelligence → session 2
- [ ] spec-03-currency → session 3
- [ ] spec-04-subs-timer → session 4

### Batch 2: New features (3 parallel sessions, ~30 min)
- [ ] spec-05-tce-calculator → session 1
- [ ] spec-06-laytime-calc → session 2
- [ ] spec-07-fcl-lcl → session 3

### Batch 3: Integration (1 session, ~20 min)
- [ ] spec-08-integration → session 1

**Итого: ~1.5-2 часа при 4 параллельных сессиях**

## How to Run

### Подготовка
1. SSH на VPS: `ssh root@<VPS_IP>`
2. `cd /root/quantika-demo && git pull`
3. Открой N вкладок Claude Code web (Sonnet)

### Выполнение батча
1. В каждой вкладке: "Прочитай .specs/spec-NN-name.md и выполни"
   (каждая сессия создаёт свою ветку spec/spec-NN-name)
2. Дождись завершения ВСЕХ сессий батча
3. Открой Opus-сессию для мержа батча: "Прочитай .specs/merge-verify.md, секция Batch N, и замержи все ветки"
4. Переходи к следующему батчу

### Финализация
Открой сессию на Opus: "Прочитай .specs/merge-verify.md и выполни финальную верификацию"
Перезапусти PM2: `pm2 restart quantika-demo`
Прогони smoke test: `bash scripts/smoke-test.sh`
