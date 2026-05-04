# R — language context

## SQL embedded in R

SQL is the primary way to read the dataset.
Use R as a wrapper for these queries.
Use helper libraries from the data organization to connect to the dataset(s).
Be aware that queries that return large amounts of data might overflow the containter. Prioritize aggregation.

## Database access & loading

- Prefer the data organization's helper library if one is provided — it likely wraps connection, auth, and cleanup.
- Otherwise, common drivers: `duckdb` (in-process OLAP and local analysis), all fronted by the `DBI` interface.
- `DBI::dbGetQuery()` returns a full data frame; `DBI::dbSendQuery()` + `dbFetch(res, n = N)` lets you stream in chunks for large pulls.
- Always `DBI::dbDisconnect(con)` (or wrap in `on.exit()`) so connections close even on error.

## Packages

Only the packages already available in the environment can be used. No new packages can be installed in the enclave. Use `installed.packages()` to get the list of installed packages.

## Producing the output artifact

The deliverable is either a **CSV** or a knitted **RMD → HTML** uploaded to the TOA endpoint. A study may produce both.
