# Planning & design documents

This directory holds the design specs and implementation plans that drove larger
pieces of work (e.g. the study-screen state machine). We're **experimenting with
keeping these in the repo** rather than only in tickets/PR descriptions: they
capture the "why" behind non-obvious architecture (the projection model, the
round-boundary rules, the screen-rule tables) in a form that's reviewable in a PR
and greppable next to the code it explains.

Some source comments link back here (e.g. the reviewer screen-rule table cites
`2026-06-23-reviewer-screen-state-machine-design.md`). Files are named
`YYYY-MM-DD-<topic>-<design|plan|subspec>.md` and are point-in-time records — they
are not kept in lockstep with the code as it evolves. If this experiment doesn't
earn its keep, the directory can be dropped wholesale (update the few source
comments that reference it).
