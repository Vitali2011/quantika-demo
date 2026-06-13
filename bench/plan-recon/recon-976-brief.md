# Recon task — implausible vessel capacity

RECON MODE — read-only investigation. Do NOT edit files. Do NOT write code or a fix.
Read the repo as needed (Read/Grep/Glob/Bash-grep) and find the single ROOT CAUSE.

## Symptom (what was observed)

In the demo, the grain/bale capacity figure for many vessels (17+) shows impossibly large
values — on the order of ~30× the vessel's deadweight (DWT). A vessel whose DWT implies a
modest hold volume instead displays thousands of cubic-metre capacity. Some vessels are
affected, others look correct. The inflated numbers originate upstream of the UI — in how a
capacity value coming from a source email/cargo line is read into the vessel's capacity field.

## Your output (exactly these three)

1. ROOT CAUSE — one or two sentences naming the actual underlying cause (not the symptom).
2. LOCATION — the file(s) and function where it originates.
3. MECHANISM — why this produces roughly a ~30× inflation specifically.
