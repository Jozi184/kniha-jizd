function reply(body: unknown, status = 200) {
  return Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
}
export async function handleRideLog(request: Request, db?: D1Database) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user) return reply({error:'Přihlas se, aby šlo načíst a uložit knihu jízd.'},401);
  if (!db) return reply({error:'Ukládání je dočasně nedostupné.'},503);
  try {
    if (request.method === 'GET') {
      const row = await db.prepare('SELECT payload, revision FROM ride_log WHERE user_id = ?').bind(user).first<{payload:string;revision:number}>();
      return reply(row ? {...JSON.parse(row.payload),revision:row.revision} : {odometerKm:0,trips:[],revision:0,empty:true});
    }
    if (request.method !== 'PUT') return reply({error:'Nepodporovaná operace.'},405);
    // Reject cross-origin writes; same-origin fetches are also available in the embedded app.
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return reply({error:'Nepovolený požadavek.'},403);
    const raw = await request.text();
    if (raw.length > 1000000) return reply({error:'Kniha jízd je příliš velká.'},413);
    const body = JSON.parse(raw);
    const {odometerKm,trips,revision} = body;
    if (!Number.isFinite(odometerKm) || odometerKm < 0 || !Number.isInteger(revision) || revision < 0 || !Array.isArray(trips) || trips.some(t => !t || !Number.isFinite(t.distanceKm) || t.distanceKm <= 0 || !Number.isFinite(t.startedAt) || !Number.isFinite(t.endedAt) || !Number.isFinite(t.odometerStart) || !Number.isFinite(t.odometerEnd) || (t.route != null && (!Array.isArray(t.route) || t.route.length>1024 || t.route.some(p=>!Array.isArray(p)||p.length!==3||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>90||Math.abs(p[1])>180||![0,1].includes(p[2])))) || typeof t.type !== 'string' || typeof t.note !== 'string' || (t.from != null && typeof t.from !== 'string') || (t.to != null && typeof t.to !== 'string'))) return reply({error:'Neplatný stav knihy jízd.'},400);
    const row = await db.prepare('INSERT INTO ride_log (user_id, payload, revision) SELECT ?, ?, 1 WHERE ? = 0 OR EXISTS (SELECT 1 FROM ride_log WHERE user_id = ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, revision = ride_log.revision + 1 WHERE ride_log.revision = ? RETURNING revision')
      .bind(user,JSON.stringify({odometerKm,trips}),revision,user,revision).first<{revision:number}>();
    if (!row) return reply({error:'Kniha jízd se změnila v jiném okně. Obnov stránku; rozepsanou jízdu si nejdřív poznamenej.'},409);
    return reply({revision:row.revision});
  } catch (err) {
    console.error('Ride log operation failed',err);
    return reply({error:'Uložení nebo načtení se nepodařilo. Zkus to znovu.'},503);
  }
}
