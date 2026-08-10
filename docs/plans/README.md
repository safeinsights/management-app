# Planning & design documents

This directory holds the design specs and implementation plans that drove larger
pieces of work (e.g. the study-screen state machine). We're **experimenting with
keeping these in the repo** rather than only in tickets/PR descriptions: they
capture the "why" behind non-obvious architecture (the projection model, the
round-boundary rules, the screen-rule tables) in a form that's reviewable in a PR
and greppable next to the code it explains.

Files are named `YYYY-MM-DD-<topic>-<design|plan|subspec>.md` and are point-in-time
records — they are **not** kept in lockstep with the code as it evolves. Cite them for
_rationale_ only; a source comment or doc that needs the current **rules** must point at
the living doc instead (for the study screens: `docs/study-screens-logic.md`). A stale
plan is harmless until something treats it as the contract.

If this experiment doesn't earn its keep, the directory can be dropped wholesale (update
the few source comments that reference it).
