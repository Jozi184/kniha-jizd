import { createClient } from 'npm:@supabase/supabase-js@2.102.0';
const origin='https://jozi184.github.io';
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{...cors,'Cache-Control':'no-store'}});
const key=Deno.env.get('MAPY_API_KEY')||'__SERVER_MAPY_KEY__';
const auth=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
function label(items:any[]=[]){
 const item=items.find(x=>x.type==='regional.address')||items.find(x=>x.type==='regional.street')||items.find(x=>x.type==='regional.municipality')||items.find(x=>x.type==='regional.municipality_part');
 if(!item?.name)return '';
 const town=item.regionalStructure?.find((x:any)=>x.type==='regional.municipality')?.name;
 return town&&town!==item.name?`${item.name}, ${town}`:item.name;
}
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{headers:cors});
 if(request.method!=='POST')return json({},405);
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)return json({},403);
 const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(!token)return json({error:'Přihlas se.'},401);
 const {data,error}=await auth.auth.getUser(token);
 if(error||!data.user)return json({error:'Přihlas se.'},401);
 if(!key||key==='__SERVER_MAPY_KEY__')return json({error:'Mapa není nastavena.'},503);
 try{
  const text=await request.text();if(text.length>1024)return json({},413);
  const body=JSON.parse(text);
  if(body.action==='tile'){
   const {z,x,y}=body;
   if(![z,x,y].every(Number.isInteger)||z<0||z>18||x<0||y<0||x>=2**z||y>=2**z)return json({},400);
   const upstream=await fetch(`https://api.mapy.com/v1/maptiles/basic/256/${z}/${x}/${y}?apikey=${encodeURIComponent(key)}`,{signal:AbortSignal.timeout(10000)});
   if(!upstream.ok)return json({error:'Podklad je nedostupný.'},502);
   return new Response(upstream.body,{headers:{...cors,'Content-Type':upstream.headers.get('Content-Type')||'image/png','Cache-Control':'private, max-age=86400'}});
  }
  if(body.action!=='places')return json({},400);
  const valid=(p:any)=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
  if(!valid(body.start)||!valid(body.end))return json({},400);
  const lookup=async(p:number[])=>{
   const url=new URL('https://api.mapy.com/v1/rgeocode');url.searchParams.set('lat',String(p[0]));url.searchParams.set('lon',String(p[1]));url.searchParams.set('lang','cs');
   const r=await fetch(url,{headers:{'X-Mapy-Api-Key':key},signal:AbortSignal.timeout(8000)});
   return r.ok?label((await r.json()).items):'';
  };
  const [from,to]=await Promise.all([lookup(body.start),lookup(body.end)]);return json({from,to});
 }catch{return json({error:'Mapová služba je nedostupná.'},502);}
});
