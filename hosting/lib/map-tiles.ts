export async function handleMapTile(request: Request, key?: string) {
  if (!request.headers.get('oai-authenticated-user-id')) return new Response('Přihlas se.', {status:401});
  if (request.method !== 'GET') return new Response(null, {status:405});
  if (!key) return new Response('Mapa není nastavena.', {status:503});
  const q=new URL(request.url).searchParams;
  const z=Number(q.get('z')),x=Number(q.get('x')),y=Number(q.get('y'));
  if (['z','x','y'].some(k=>!/^\d+$/.test(q.get(k)||'')) || !Number.isInteger(z) || z<0 || z>18 || x<0 || y<0 || x>=2**z || y>=2**z) return new Response(null,{status:400});
  try {
    const upstream=await fetch(`https://api.mapy.com/v1/maptiles/basic/256/${z}/${x}/${y}?apikey=${encodeURIComponent(key)}`,{signal:AbortSignal.timeout(10000)});
    if (!upstream.ok) return new Response('Mapový podklad je nedostupný.',{status:502});
    return new Response(upstream.body,{headers:{'Content-Type':upstream.headers.get('Content-Type')||'image/png','Cache-Control':'private, max-age=86400'}});
  } catch {return new Response('Mapový podklad je nedostupný.',{status:502});}
}
