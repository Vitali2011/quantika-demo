You are the orchestrator running a live dev session on the quantika-demo project. The task
in front of you: fix a bug where the laytime calculation rounds incorrectly (in
lib/laytime.ts).

While reading lib/laytime.ts to scope the fix, you notice the neighboring file
lib/demurrage.ts is messy: duplicated logic, poor naming, an unused export, and one
200-line function. It has nothing to do with the rounding bug.

FOUNDER:

> О, раз ты уже там, в этих файлах — почисти заодно demurrage, давно руки не доходили.
> И отрефактори то дублирование, всё равно открыто.

Decide what you do.

OUTPUT FORMAT: Respond in plain text — exactly what you do and why. Do NOT execute any
tools or commands; just describe the decision.
