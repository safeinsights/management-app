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

// Left deliberately un-awaited and un-executed (OTTER-724 / MA-13). The builder below is never
// run, so `user.full_name` survives a rollback. Adding `.execute()` would be wrong on two counts:
// the DROP FUNCTION above uses invalid syntax (`RETURNS text` is not accepted by Postgres) and so
// fails first, and the drop order is backwards anyway -- the generated column depends on
// smart_concat(), so the column must go before the function. Fixing this rollback path is out of
// scope here; the forward migration is correct and `full_name` is relied on by
// 1774000000000_add_pi_user_id_to_study.
export async function down(db: Kysely<unknown>): Promise<void> {
    await sql`DROP FUNCTION smart_concat(a text, b text) RETURNS text;`.execute(db)
    db.schema.alterTable('user').dropColumn('full_name')
}
