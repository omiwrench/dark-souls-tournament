import { bellRush } from '@dst/shared'
import type { Db } from './client'
import { rulesets } from './schema'

/** Inserts the default ruleset on first start. */
export function seed(db: Db, now: Date) {
  if (db.select({ id: rulesets.id }).from(rulesets).limit(1).all().length > 0) return
  const timestamp = now.toISOString()
  db.insert(rulesets)
    .values({
      id: bellRush.id,
      name: bellRush.name,
      definition: bellRush,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run()
}
