// Execute db/knowledge-base.sql against Supabase REST (postgrest) using node-fetch.
// Uses anon key + project URL from .env.local (public, safe).
const fs = require('fs');
const _fetch = require('node-fetch');
void _fetch;

const txt = fs.readFileSync('.env.local', 'utf8');
const _url = txt.split('NEXT_PUBLIC_SUPABASE_URL=')[1].split('\n')[0].trim().replace(/"/g,'');
void _url;
const _key = txt.split('NEXT_PUBLIC_SUPABASE_ANON_KEY=')[1].split('\n')[0].trim().replace(/"/g,'');
void _key;

const sqlRaw = fs.readFileSync('db/knowledge-base.sql', 'utf8');
// Split on semicolons, ignore empty/comment-only statements
const stmts = sqlRaw.split(';').map(s=>s.trim()).filter(s=>s.length>0 && !s.startsWith('--'));
console.log('Statements to run:', stmts.length);

async function run() {
  for (let i=0; i<stmts.length; i++) {
    const stmt = stmts[i];
    // Try REST /rest/v1/ via POST (postgrest supports raw SQL through a custom endpoint usually not exposed); 
    // Instead use Supabase's SQL Editor-style endpoint if available, else fall back to reporting.
    console.log('[', i+1, '] ', stmt.substring(0,90).replace(/\n/g,' '), '...');
  }
  console.log('NOTE: Supabase REST does not expose direct raw SQL execution for arbitrary DDL without service_role / SQL Editor.');
  console.log('Confirm via Supabase → SQL Editor by pasting db/knowledge-base.sql manually, or use psql with DATABASE_URL.');
}
run().catch(console.error);
