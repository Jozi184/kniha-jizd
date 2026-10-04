/* Resolve endpoints once per draft; preserve any user edits and saved labels. */
const draftPlaceJobs=new WeakMap();
let placeInputHooks=false;
async function lookupRoutePlaces(route){
 const points=validRoute(route);if(!points.length)return {from:'',to:''};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const first=points[0],last=points[points.length-1];
  const response=await fetch('/api/ride-places',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start:first.slice(0,2),end:last.slice(0,2)}),signal:controller.signal,cache:'no-store'});
  if(!response.ok)return {from:'',to:''};const value=await response.json();
  return {from:typeof value.from==='string'?value.from:'',to:typeof value.to==='string'?value.to:''};
 }catch{return {from:'',to:''};}finally{clearTimeout(timer);}
}
function populateDraftPlaces(draft){
 if(!placeInputHooks){for(const [id,field]of [['tripFrom','fromEdited'],['tripTo','toEdited']])$(id).addEventListener('input',()=>{const job=draftPlaceJobs.get(state.draft);if(job)job[field]=true;});placeInputHooks=true;}
 const info=$('placeLookupInfo'),status=$('placeLookupStatus');
 if(draft.manual||!validRoute(draft.route).length){info.classList.add('hidden');return;}
 info.classList.remove('hidden');status.textContent='Doplňuji odkud a kam podle GPS…';
 const job={fromEdited:false,toEdited:false,promise:null};draftPlaceJobs.set(draft,job);
 job.promise=lookupRoutePlaces(draft.route).then(labels=>{
  if(state.draft!==draft)return;
  if(!job.fromEdited&&!$('tripFrom').value.trim())$('tripFrom').value=labels.from;
  if(!job.toEdited&&!$('tripTo').value.trim())$('tripTo').value=labels.to;
  if(labels.from||labels.to)draft.placesSource='Mapy.com';
  status.textContent=labels.from&&labels.to?'Místa doplněna podle GPS. Před uložením je můžeš upravit.':'Některé místo se nepodařilo určit. Můžeš je doplnit ručně.';
 });
}
function waitDraftPlaces(draft){return draftPlaceJobs.get(draft)?.promise||Promise.resolve();}
async function fillExistingPlaces(){
 if(state.startedAt||state.draft)return;
 const snapshot=log;let changed=false;
 const trips=snapshot.trips.slice();
 const targets=trips.map((t,i)=>({t,i})).filter(({t})=>!t.manual&&validRoute(t.route).length&&(!t.from||!t.to)).slice(0,10);
 for(const {t,i} of targets){
  const labels=await lookupRoutePlaces(t.route);
  if(log!==snapshot||state.startedAt||state.draft)return;
  if((!t.from&&labels.from)||(!t.to&&labels.to)){trips[i]={...t,from:t.from||labels.from,to:t.to||labels.to,placesSource:'Mapy.com'};changed=true;}
 }
 if(changed&&log===snapshot&&!storageBusy&&!state.startedAt&&!state.draft)await persistLog(snapshot.odometerKm,trips);
}
