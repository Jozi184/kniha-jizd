type Entity={name?:string;type?:string;location?:string;regionalStructure?:{name:string;type:string}[]};
export function placeLabel(items:Entity[]=[]){
 const item=items.find(x=>x.type==='regional.address')||items.find(x=>x.type==='regional.street')||items.find(x=>x.type==='regional.municipality')||items.find(x=>x.type==='regional.municipality_part');
 if(!item?.name)return '';
 const town=item.regionalStructure?.find(x=>x.type==='regional.municipality')?.name;
 return town && town!==item.name ? `${item.name}, ${town}` : item.name;
}
export async function handleRidePlaces(request:Request,key?:string){
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 if(!request.headers.get('oai-authenticated-user-id'))return reply({error:'Přihlas se.'},401);
 if(request.method!=='POST')return reply({},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return reply({},403);
 if(!key)return reply({error:'Mapová služba není nastavena.'},503);
 try{
  const raw=await request.text();if(raw.length>1024)return reply({},413);
  const {start,end}=JSON.parse(raw);
  const valid=(p:unknown)=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
  if(!valid(start)||!valid(end))return reply({},400);
  const lookup=async(p:number[])=>{try{
   const url=new URL('https://api.mapy.com/v1/rgeocode');url.searchParams.set('lat',String(p[0]));url.searchParams.set('lon',String(p[1]));url.searchParams.set('lang','cs');
   const r=await fetch(url,{headers:{'X-Mapy-Api-Key':key},signal:AbortSignal.timeout(8000)});
   if(!r.ok)return '';const data=await r.json() as {items?:Entity[]};return placeLabel(data.items);
  }catch{return '';}};
  const from=await lookup(start);const to=start[0]===end[0]&&start[1]===end[1]?from:await lookup(end);
  return reply({from,to});
 }catch{return reply({error:'Místa se nepodařilo načíst.'},502);}
}
