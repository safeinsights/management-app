# Python — language context

## SQL embedded in Python

SQL is the primary way to read the dataset.
Use Python as a wrapper for these queries.
Use helper libraries from the data organization to connect to the dataset(s).
Be aware that queries that return large amounts of data might overflow the container. Prioritize aggregation.

## Database access & loading

- Prefer the data organization's helper library if one is provided — it likely wraps connection, auth, and cleanup.
- Otherwise, common drivers: `duckdb` (in-process OLAP and local analysis), `psycopg` (Postgres), optionally fronted by `sqlalchemy`.
- Load query results with `pandas.read_sql()` or `polars.read_database()`; for large pulls use `chunksize=` or a streaming cursor instead of materializing the full result set.
- Close cursors and connections with `with` blocks (or `try` / `finally`) so they're released on error.

## Packages

Only the packages already available in the environment can be used. No new packages can be installed in the enclave. Use `pip list` to get the list of installed packages.

## Producing the output artifact

The deliverable is a **CSV** uploaded to the TOA endpoint.
