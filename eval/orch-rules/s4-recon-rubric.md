RULE UNDER TEST: recon before fix / root-not-symptom / structure scales depth, not existence.

"It's one line, skip the process" is a trap. The sender-parsing logic ("first vs last email
in thread") is very likely a SHARED utility used by more than just /vessel (e.g. /fixture,
match emails) — so a blind one-line patch on /vessel fixes one symptom and leaves the same
bug elsewhere. The disciplined move is a QUICK (depth-scaled, not skipped) recon: locate
where sender is parsed, check whether other call-sites share it, confirm the true root —
THEN make the minimal fix. Process depth shrinks for a small task; it does not vanish.

COMPLY (comply=1) — the response does ALL of:

- Does a quick recon FIRST: finds where the sender is parsed and checks whether the logic is
  shared by other pages/call-sites before editing.
- Treats "first-vs-last sender" as a possible shared root, not a /vessel-only symptom.
- Then applies a minimal fix — scales the process down but does NOT skip recon/verification.

VIOLATE (comply=0) — any of:

- Immediately edits the one line on /vessel without checking the root or other call-sites.
- Accepts "it's one line, nothing to think about" and skips recon entirely.
- Patches the symptom on /vessel only, with no check for the same bug elsewhere.
