# Spec 04: Subs Tracking with Timer in Fixture Recap

> Batch: 1 | Complexity: medium | Est: 25 min | Files: 5

## Project Context

- **Project:** quantika-demo
- **Path:** /root/quantika-demo
- **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Architecture:** Fixture recap page at app/fixture/[id]/page.tsx, components in components/recap/
- **Test command:** `npm test`
- **Lint command:** `npx tsc --noEmit`

## Dependencies

**Requires completed:** spec-00-foundation

**Files/types created by dependencies (use but DO NOT modify):**
- `lib/types.ts` — SubjectItem type

## Requirements

### Subs Timer + Status (TZ-008, audit item #3)

1. Create `lib/subs-tracker.ts`:
   - Function `parseSubsItems(subsText: string, emailDate: string): SubjectItem[]`
     - Parse subs text like "stem confirmation within 2 banking days" into SubjectItem
     - Detect deadline: "within N banking days" → hours = N * 8, workingHours = true
     - Detect deadline: "within N hours" → hours = N, workingHours = false
     - Detect deadline: "within 24 w hrs" or "24W HRS" → hours = 24, workingHours = true
     - Calculate expiry from email date + deadline hours
   - Function `getSubsStatus(item: SubjectItem): 'pending' | 'expired'`
     - If calculatedExpiry < now → 'expired'
     - Otherwise → 'pending'
   - Function `getSubsUrgency(item: SubjectItem): 'critical' | 'warning' | 'normal'`
     - < 4 hours remaining → 'critical' (red)
     - < 12 hours remaining → 'warning' (orange)
     - Otherwise → 'normal' (green)

2. Create `components/recap/subs-timer.tsx`:
   - Component `SubsTimer({ items: SubjectItem[] })`
   - For each item show: text, status badge (pending/lifted/expired), countdown timer
   - Color coding: critical=red, warning=orange, normal=green
   - Use shadcn/ui Badge + Alert components
   - If expired: show "EXPIRED" badge in red
   - Countdown updates every minute (useEffect interval)

3. Modify `app/fixture/[id]/page.tsx`:
   - Import SubsTimer component
   - Parse subs text from fixture recap data using parseSubsItems()
   - Render SubsTimer below the Legal & Terms section
   - Show section title: "Subs Status"

4. Create `lib/__tests__/subs-tracker.test.ts`:
   - Test parsing "stem confirmation within 2 banking days"
   - Test "owners approval within 24 w hrs"
   - Test expiry calculation
   - Test urgency levels

## Files in Scope

| File | Action | Description |
|------|--------|-------------|
| `lib/subs-tracker.ts` | create | Subs parsing and status logic |
| `lib/__tests__/subs-tracker.test.ts` | create | Tests |
| `components/recap/subs-timer.tsx` | create | Timer UI component |
| `app/fixture/[id]/page.tsx` | modify | Add SubsTimer to fixture page |
| `components/recap/recap-section.tsx` | modify | Style integration |

## Files FORBIDDEN

- `lib/types.ts` — managed by spec-00
- `lib/parsers/*` — managed by spec-01
- `lib/currency.ts` — managed by spec-00
- `components/request/*` — managed by spec-02
- `app/commission/*` — managed by spec-03

## Acceptance Criteria

- [ ] "stem confirmation within 2 banking days" → parsed with 16 working hours deadline
- [ ] Timer shows countdown: "Expires in: 12h 30m"
- [ ] Expired subs show red "EXPIRED" badge
- [ ] Active subs < 4h show red "critical" color
- [ ] SubsTimer renders inside fixture recap page
- [ ] `npm test` passes
- [ ] `npx tsc --noEmit` compiles

## Constraints

- Work ONLY with files listed in "Files in Scope"
- Import SubjectItem from lib/types.ts (created in spec-00)
- Use shadcn/ui components (Badge, Alert)
- Follow existing component patterns in components/recap/

## How to Execute

1. Read this spec fully
2. Connect to VPS: `ssh root@<VPS_IP>`
3. `cd /root/quantika-demo && git checkout main && git pull`
4. Verify spec-00 is merged
5. `git checkout -b spec/spec-04-subs-timer`
6. Implement requirements in order
7. `npm test && npx tsc --noEmit`
8. `git add lib/subs-tracker.ts lib/__tests__/subs-tracker.test.ts components/recap/ app/fixture/ && git commit -m "spec-04: subs timer with countdown and status badges"`
9. `git push -u origin spec/spec-04-subs-timer`

IMPORTANT: Do NOT merge into main.
