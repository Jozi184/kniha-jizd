const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const source=html.match(/<script>\s*const \$[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
// Parse the entire production script, then run its actual review/save/render/export code with controlled storage.
new vm.Script(source);
function section(start,end){return source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));}
function setup(){
 const elements={},events={};let saved=null,ok=true;
 const $=id=>elements[id]??=( {value:'',textContent:'',classList:{toggle(){},add(){},remove(){}},focus(){this.focused=true},addEventListener(type,fn){events[id+':'+type]=fn},querySelectorAll(){return []}} );
 const context={$,state:{draft:null},Date,Number,alert(){throw Error('Unexpected alert')},waitDraftPlaces:async()=>{},populateDraftPlaces(){},resetPhotoInputs(){},localRemove(){},getTrips:()=>[],formatOdometer:v=>String(v),fmtDuration:()=>'',disposeRideMaps(){},rideMapMarkup:()=>'',bindRideMaps(){},persistLog:async(odo,trips)=>{saved={odo,trips};return ok}};
 vm.createContext(context);
 vm.runInContext(section('function parseOdometer(','function formatOdometer'),context);
 vm.runInContext(section('let saveTripBusy=', 'function discardDraft'),context);
 vm.runInContext(section('function renderTrips()', "$('exportCsv').addEventListener"),context);
 vm.runInContext(section('function updateCarOdometerHint()', "$('manualTrip').addEventListener"),context);
 $('tripType').value='Služební';context.state.draft={startedAt:100000,endedAt:200000,distanceKm:17.35,odometerStart:50000,odometerEnd:50017.35};
 context.prepareFinish();$('correctedKm').value='18';
 return {context,$,save:()=>events['saveTrip:click'](),saved:()=>saved,setOk:v=>ok=v};
}
(async()=>{
 let t=setup();assert.equal(t.context.state.draft.gpsDistanceKm,17.35);assert.equal(t.$('carOdometerEnd').value,'');assert.equal(t.$('carOdometerEnd').required,true);
 await t.save();assert.equal(t.saved(),null);assert(t.$('carOdometerEnd').focused);assert.match(t.$('finishStatus').textContent,/služební/);
 for(const bad of ['-1','NaN','12x','1,2,3','Infinity']){t=setup();t.$('carOdometerEnd').value=bad;await t.save();assert.equal(t.saved(),null,bad);}
 for(const value of ['50 018,2','50018.2','50\u00a0018,2']){t=setup();t.$('carOdometerEnd').value=value;await t.save();assert.equal(t.saved().trips[0].carOdometerEnd,50018.2);assert.equal(t.saved().trips[0].gpsDistanceKm,17.35);assert.equal(t.saved().trips[0].distanceKm,18);assert.equal(t.saved().odo,50018);}
 t=setup();t.$('carOdometerEnd').value='0';await t.save();assert.equal(t.saved().trips[0].carOdometerEnd,0);
 t=setup();t.$('carOdometerEnd').value='50018,2';t.setOk(false);await t.save();assert.equal(t.context.state.draft.carOdometerEnd,50018.2);assert.equal(t.$('carOdometerEnd').value,'50018,2');t.setOk(true);await t.save();assert.equal(t.context.state.draft,null);
 t=setup();t.$('tripType').value='Soukromá';t.context.updateCarOdometerHint();assert.equal(t.$('carOdometerEnd').required,false);await t.save();assert.equal(t.saved().trips[0].carOdometerEnd,undefined);
 const trip={startedAt:100000,endedAt:200000,distanceKm:18,odometerStart:50000,odometerEnd:50018,type:'Služební',note:'',carOdometerEnd:50018.2,gpsDistanceKm:17.35};
 const rows=t.context.tripCsvRows([trip,{...trip,carOdometerEnd:undefined,gpsDistanceKm:undefined}]);assert.equal(rows[0].length,12);assert.equal(rows[1][10],'50018.200');assert.equal(rows[1][11],'17.350');assert.equal(rows[2][10],'');assert.equal(rows[2][11],'');
 t.context.getTrips=()=>[trip];t.context.renderTrips();assert.match(t.$('tripList').innerHTML,/Tachometr v autě na konci: 50018.2 km/);assert.match(t.$('tripList').innerHTML,/Naměřeno GPS:/);
 t.context.getTrips=()=>[{...trip,carOdometerEnd:undefined,gpsDistanceKm:undefined}];t.context.renderTrips();assert(!t.$('tripList').innerHTML.includes('Tachometr v autě na konci:'));
 console.log('Passed: required business reading, optional private reading, Czech decimals, invalid values, zero reading, failed-save retry, GPS preservation, legacy history and CSV');
})().catch(e=>{console.error(e);process.exit(1)});
