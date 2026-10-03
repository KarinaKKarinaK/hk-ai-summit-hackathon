import Recorder from '@/components/Recorder'
import { sql } from '@/lib/server'

export const dynamic = 'force-dynamic'

// The recorder itself runs in the browser. This wrapper only fetches the in-demand tasks
// a visitor can do at a desk right now: open requests marked as quick.
export default async function RecordPage() {
  const tasks = await sql`select id, title, description, rate from calls where quick and hours > 0 order by created_at limit 2`.catch(() => [])
  return <Recorder tasks={tasks.map((t) => ({ id: t.id, title: t.title, description: t.description ?? '', rate: t.rate }))} />
}
