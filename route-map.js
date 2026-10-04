/* GPS route recording and lazy Mapy.com maps. Coordinates never change trip distance. */
function appendRoutePoint(route,p,breakBefore=false){
 route.push([Number(p.lat.toFixed(6)),Number(p.lon.toFixed(6)),breakBefore?1:0]);
 if(route.length>1024){
  const reduced=[route[0]];
  for(let i=2;i<route.length-1;i+=2)reduced.push([route[i][0],route[i][1],route[i][2]||route[i-1][2]]);
  reduced.push(route[route.length-1]);route.splice(0,route.length,...reduced);
 }
}
function validRoute(route){return Array.isArray(route)?route.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180):[];}
function routeSegments(route){const segments=[];for(const p of validRoute(route)){if(!segments.length||p[2])segments.push([]);segments[segments.length-1].push([p[0],p[1]]);}return segments;}
function rideMapMarkup(trip,index){
 const route=validRoute(trip.route);
 if(!route.length)return '<div class="trip-meta">'+(trip.manual?'Ruční jízda · bez GPS trasy.':'GPS trasa není u této jízdy uložená.')+'</div>';
 return `<details class="ride-map-details" data-ride-map="${index}"><summary>Zobrazit mapu trasy</summary><div class="ride-map-status" role="status">${route.length===1?'Uložený je pouze jeden bod polohy.':'GPS záznam · zelený bod je začátek, červený konec.'}</div><div class="ride-map" aria-label="Mapa zaznamenané GPS trasy"></div></details>`;
}
let leafletPromise;
const rideMaps=new Set();
function disposeRideMaps(){for(const map of rideMaps)map.remove();rideMaps.clear();}
function loadRideMapLibrary(){
 if(window.L)return Promise.resolve(window.L);
 if(leafletPromise)return leafletPromise;
 leafletPromise=new Promise((resolve,reject)=>{
  if(!document.querySelector('link[data-leaflet]')){const css=document.createElement('link');css.rel='stylesheet';css.href='vendor/leaflet.css';css.dataset.leaflet='1';document.head.append(css);}
  const script=document.createElement('script');script.src='vendor/leaflet.js';
  const timer=setTimeout(()=>{script.remove();reject(new Error('Mapa se nenačetla. Zkontroluj připojení.'));},15000);
  script.onload=()=>{clearTimeout(timer);window.L?resolve(window.L):reject(new Error('Mapa se nenačetla.'));};script.onerror=()=>{clearTimeout(timer);reject(new Error('Mapa se nenačetla. Zkontroluj připojení.'));};document.head.append(script);
 }).catch(err=>{leafletPromise=null;throw err;});return leafletPromise;
}
function bindRideMaps(container,trips){
 container.querySelectorAll('[data-ride-map]').forEach(details=>{
 let map,loading=false;
 details.addEventListener('toggle',async()=>{
  if(!details.open)return;
  if(map){map.invalidateSize();return;}if(loading)return;loading=true;
  const status=details.querySelector('.ride-map-status'),box=details.querySelector('.ride-map');
  try{
   const L=await loadRideMapLibrary();if(!details.isConnected)return;
   const points=validRoute(trips[Number(details.dataset.rideMap)].route);if(!points.length)return;
   map=L.map(box,{scrollWheelZoom:false,attributionControl:true});rideMaps.add(map);
   const tile=L.gridLayer({minZoom:0,maxZoom:18,keepBuffer:1,attribution:'<a href="https://api.mapy.com/copyright" target="_blank" rel="noopener">© Seznam.cz a.s. and others</a>'});
   tile.createTile=(coords,done)=>{
    const img=document.createElement('img');img.alt='';img.width=256;img.height=256;
    rideAccount.fetchMap('tile',{z:coords.z,x:coords.x,y:coords.y}).then(async response=>{
      if(!response.ok)throw new Error('Mapa je nedostupná.');
      const blob=await response.blob(),url=URL.createObjectURL(blob);
      img.onload=()=>{URL.revokeObjectURL(url);done(null,img);};
      img.onerror=()=>{URL.revokeObjectURL(url);done(new Error('Mapa je nedostupná.'),img);};img.src=url;
    }).catch(error=>done(error,img));return img;
   };
   tile.on('tileerror',()=>{status.textContent='Podklad se nepodařilo načíst. Zkontroluj připojení nebo dostupnost mapové služby. GPS trasa zůstává uložená.';});tile.addTo(map);
   const logo=L.control({position:'bottomleft'});logo.onAdd=()=>{const a=L.DomUtil.create('a','mapy-brand');a.href='https://mapy.com/';a.target='_blank';a.rel='noopener';const img=document.createElement('img');img.src='mapy-logo.svg';img.alt='Mapy.com';img.height=30;a.append(img);L.DomEvent.disableClickPropagation(a);return a;};logo.addTo(map);
   for(const segment of routeSegments(points))if(segment.length>1)L.polyline(segment,{color:'#426300',weight:5,opacity:.95}).addTo(map);
   const first=points[0],last=points[points.length-1];L.circleMarker([first[0],first[1]],{radius:7,color:'#fff',weight:2,fillColor:'#65a30d',fillOpacity:1}).bindTooltip('Začátek').addTo(map);
   if(points.length>1)L.circleMarker([last[0],last[1]],{radius:7,color:'#fff',weight:2,fillColor:'#dc2626',fillOpacity:1}).bindTooltip('Konec').addTo(map);
   map.fitBounds(L.latLngBounds(points.map(p=>[p[0],p[1]])),{padding:[28,28],maxZoom:16});
  }catch(err){status.textContent=err.message;}finally{loading=false;}
 });
 });
}
