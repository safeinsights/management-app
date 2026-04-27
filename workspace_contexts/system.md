# Study environment — system context

This workspace is for researchers writing **study code** that will run in an **enclave** environment - an egress-only network with highly limited endpoints - against a data organization's database. Code you help write here will execute somewhere the researcher cannot reach interactively — so correctness, reproducibility, and producing a valid output artifact are more important than cleverness.

Language-specific guidance lives in `python.md` and `r.md`. This file covers rules that apply regardless of language.

## What a study is

A study is a pipeline with these stages:

1. **Query** — pull data from the database. All queries are written in SQL, embedded inside the host language.
2. **Analysis** — transform, aggregate, model the data.
3. **Visualization** (optional) — charts, tables, plots.
4. **Output** — produce a result artifact and upload it to the **TOA (Trusted Output App) endpoint**.

Valid output artifacts:

- A results **CSV** file (Python or R).
- A knitted **RMD → HTML** file (R only).

## The TOA upload is the only thing the researcher sees on success

**On a successful run, if nothing is uploaded to the TOA endpoint, the researcher gets no result.** Make sure the happy path always ends with a TOA upload.

- Always ensure the successful code path ends with an upload to the TOA endpoint.
- Don't swallow exceptions to "guarantee" an upload — if the code fails, the environment uploads the error log to TOA automatically. Let failures fail.

## Database access & query sizing

- The container has **~8 GB of memory**. Any data loaded from the database must fit comfortably inside that, alongside the analysis overhead.
- **Prefer queries that return fewer than ~10,000 rows.** Push aggregation, filtering, joins, and grouping into SQL rather than pulling raw rows and reducing them in the host language.
- If a large pull is unavoidable, stream / chunk it rather than materializing the full result set in memory.
- Don't do `SELECT *` on wide tables — name the columns you need.

## Helper libraries

The data organization may provide a helper library (for example, pre-built connection handling, schema accessors, or upload utilities). If the researcher mentions one, prefer its helpers over rolling your own — they encode access patterns and conventions the closed environment expects.

## Enclave environment assumptions

- Assume **no outbound internet** beyond the approved database and TOA endpoints. Don't suggest `pip install` / `install.packages()` / API calls to third-party services at runtime.
- Assume packages available at runtime are a fixed, pre-approved set. If the researcher asks for a dependency, confirm it's already available before leaning on it.
- Filesystem writes outside the working directory may not persist and may not be visible — rely on the TOA upload as the exit channel, not on writing files to arbitrary paths.

## Output hygiene

Outputs are reviewed before being released back to the researcher. Keep them disclosure-safe by default:

- Prefer **aggregates** (counts, means, rates) over row-level data.
- Suppress or bin small cell counts when reporting demographics or rare categories.
- Don't include direct identifiers (names, IDs, free-text fields) in the output artifact unless the study explicitly calls for them.

## Style for study code

- Keep the script linear and readable top-to-bottom — a reviewer should be able to follow query → analysis → output without chasing abstractions.
- Comment the **why** (study design choice, known data quirk, disclosure rule), not the **what**.
- Fail loudly and early on unexpected data shapes (missing columns, empty results) — the environment will capture the error and upload the log to TOA on the researcher's behalf.
