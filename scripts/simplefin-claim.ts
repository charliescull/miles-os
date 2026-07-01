/**
 * One-time SimpleFIN setup-token → permanent Access URL claim (finance overhaul v2 §10.3).
 *
 * Usage:
 *   npx tsx scripts/simplefin-claim.ts <SETUP_TOKEN>
 *
 * The setup token is a base64-encoded CLAIM URL. We base64-decode it and POST to that URL;
 * SimpleFIN returns a permanent Access URL (with HTTP Basic creds embedded). Put that value in
 * the SIMPLEFIN_ACCESS_URL env var (Vercel + .env.local). This never hardcodes any secret.
 */

async function main() {
  const token = process.argv[2]
  if (!token) { console.error('Usage: tsx scripts/simplefin-claim.ts <SETUP_TOKEN>'); process.exit(1) }

  let claimUrl: string
  try {
    claimUrl = Buffer.from(token.trim(), 'base64').toString('utf8')
    new URL(claimUrl) // validate
  } catch {
    console.error('Setup token is not a valid base64-encoded URL.'); process.exit(1)
  }

  const res = await fetch(claimUrl, { method: 'POST' })
  if (!res.ok) { console.error(`Claim failed (${res.status}): ${await res.text()}`); process.exit(1) }
  const accessUrl = (await res.text()).trim()

  console.log('\n✅ Access URL claimed. Set this as SIMPLEFIN_ACCESS_URL (Vercel + .env.local):\n')
  console.log(accessUrl + '\n')
}

main().catch(e => { console.error(e); process.exit(1) })
