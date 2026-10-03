// node --env-file=.env.local scripts/verify-seller.mjs seller@example.com [off]
// Marks a seller's licence as checked. Run it after you have looked the licence up with the issuing body.
// ponytail: a manual step. Automate against trade registries once there is one worth integrating.
import { neon } from '@neondatabase/serverless'

const [email, off] = process.argv.slice(2)
if (!email) throw new Error('usage: verify-seller.mjs <email> [off]')
const rows = await neon(process.env.DATABASE_URL)`update users set verified = ${off !== 'off'} where email = ${email.toLowerCase()} and role = 'seller' returning name, credential, verified`
console.log(rows[0] ?? 'no seller with that email')
