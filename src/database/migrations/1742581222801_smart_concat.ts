import { type Kysely, sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
CREATE FUNCTION smart_concat(a text, b text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case
    when a is not null and a != '' and b is not null and b != '' then
      a || ' ' || b
    when a is not null and a != '' then
      coalesce(a, '')
    else
      coalesce(b, '')
  end
$$;
`.execute(db)

    await sql`alter table "user" add column full_name TEXT GENERATED ALWAYS AS (smart_concat(first_name, last_name)) STORED NOT NULL`.execute(
        db,
    )
}

export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP FUNCTION smart_concat(a text, b text) RETURNS text;`.execute(db)
    db.schema.alterTable('user').dropColumn('full_name')
}
