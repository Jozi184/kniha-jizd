const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>\s*const \$[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
const section=(start,end)=>script.slice(script.indexOf(start),script.indexOf(end,script.indexOf(start)));
const elements={},buttons=[],cache={};let serverTrips=[],written;
const $=id=>elements[id]??={textContent:'',innerHTML:'',querySelectorAll(selector){return selector==='[data-confirm-delete]'?buttons:[]}};
const context={$,Date,Number,Math,JSON,state:{},rideAccount:{user:{id:'test'}},localStorage:{getItem:k=>cache[k],setItem:(k,v)=>cache[k]=v},document:{querySelectorAll:()=>[]},renderOdometer(){},restoreActiveTrip(){},fillExistingPlaces(){},disposeRideMaps(){},rideMapMarkup:t=>t.id,bindRideMaps:(el,trips)=>{context.mapped=trips},formatOdometer:String,fmtDuration:()=>'',requestLog:async(method,body)=>method==='GET'?{odometerKm:50000,trips:serverTrips,revision:1}:(written=body,{revision:2})};
vm.createContext(context);
vm.runInContext(section('let log =','async function requestLog'),context);
vm.runInContext(section('async function persistLog','function parseOdometer'),context);
vm.runInContext(section('function renderTrips()',"$('exportCsv').addEventListener"),context);
function trip(id,date){return {id,startedAt:new Date(date).getTime(),endedAt:new Date(date).getTime(),distanceKm:1,odometerStart:49999,odometerEnd:50000,type:'Soukromá',note:'',manual:true};}
const ids=trips=>Array.from(trips,t=>t.id);
(async()=>{
 const oct=trip('oct','2026-10-31T12:00:00+01:00'),nov1=trip('nov1','2026-11-01T12:00:00+01:00'),nov2=trip('nov2','2026-11-02T12:00:00+01:00');
 serverTrips=[nov1,oct,nov2];await context.initializeLog();
 assert.deepEqual(ids(context.getTrips()),['nov2','nov1','oct']);
 assert.deepEqual(ids(serverTrips),['nov1','oct','nov2'],'Loading must not mutate input');
 assert.strictEqual(context.getTrips(),context.getTrips(),'Deletion uses a stable history reference');
 assert.deepEqual(ids(context.mapped),['nov2','nov1','oct']);
 const early=trip('early','2026-10-30T09:00:00+01:00');
 await context.persistLog(50001,[early,...context.getTrips()]);
 assert.deepEqual(ids(written.trips),['nov2','nov1','oct','early'],'Backdated manual entry');
 assert.equal(written.odometerKm,50001);
 const afternoon=trip('afternoon','2026-11-01T17:00:00+01:00');
 await context.persistLog(50002,[afternoon,...context.getTrips()]);
 assert.deepEqual(ids(context.getTrips()),['nov2','afternoon','nov1','oct','early'],'Out-of-order approval and time of day');
 const rows=context.tripCsvRows([early,nov1,nov2,oct]);
 assert.equal(rows[1][0],new Date(nov2.startedAt).toLocaleDateString('cs-CZ'));
 assert.equal(rows[4][0],new Date(early.startedAt).toLocaleDateString('cs-CZ'));
 const tied={...nov2,id:'tied'},invalid={...early,id:'invalid',startedAt:'bad'};
 assert.deepEqual(ids(context.sortTripsByDate([nov2,invalid,tied])),['nov2','tied','invalid']);
 // A delete index must address the ride rendered at that index, including its map.
 const button={dataset:{confirmDelete:'1'},addEventListener:(type,fn)=>button.click=fn};buttons.push(button);
 context.renderTrips();await button.click();
 assert.deepEqual(ids(written.trips),['nov2','nov1','oct','early']);
 assert.equal(written.odometerKm,50001);
 console.log('Passed: chronological load, backdated entry, out-of-order approval, same-day times, CSV, stable ties, map order and deletion after sorting');
})().catch(e=>{console.error(e);process.exit(1)});
