const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../KnihaJizd/NativeBridge.js'),'utf8');
function setup(origin='https://jozi184.github.io') {
 const messages=[],elements={};let ok=false, originalCalls=0;
 const $=id=>elements[id]||(elements[id]={events:{},classList:{hidden:false,add(){this.hidden=true},remove(){this.hidden=false},contains(){return this.hidden}},addEventListener(type,fn,capture){(this.events[type]??=[]).push({fn,capture})}});
 const context={location:{origin},window:{webkit:{messageHandlers:{nativeRide:{postMessage:m=>messages.push(m)}}}},rideAccount:{user:{id:'test-user'}},document:{hidden:false,addEventListener(){}},storageReady:true,storageBusy:false,state:{startedAt:null,draft:null,timerId:null},log:{trips:[]},$,setTimeout(){},setInterval:()=>1,clearInterval(){},localRemove(){},prepareFinish(){},formatOdometer:String,renderLive(){},loadOdometer:()=>100,getTrips:()=>context.log.trips,discardDraft(){context.state.draft=null;context.state.startedAt=null},persistLog:async()=>ok,watchGps(){},alert(){}};
 context.window.top=context.window;context.window.rideAccount=context.rideAccount;
 function click(id){const event={preventDefault(){},stopImmediatePropagation(){this.stopped=true}};for(const h of $(id).events.click||[]){h.fn(event);if(event.stopped)break}}
 vm.createContext(context);vm.runInContext(source,context);
 return {context,messages,click,setOk:v=>ok=v};
}
(async()=>{
 let t=setup();t.click('startTrip');assert.equal(t.messages.at(-1).action,'start');assert.equal(t.messages.at(-1).odometerStart,100);
 const ride={id:'ride-1',startedAt:1000,distanceKm:1,route:[[50,14,1]],odometerStart:100};
 t.context.window.__receiveNativeRide({ride,message:'GPS',speedKmh:35});assert.equal(t.context.state.distanceKm,1);assert.equal(t.context.state.latestSpeedKmh,35);
 t.click('stopTrip');assert.equal(t.messages.at(-1).action,'stop');assert.equal(t.context.state.draft,null);
 t.context.window.__receiveNativeRide({ride:{...ride,endedAt:2000},message:'Ended'});assert.equal(t.context.state.draft.odometerEnd,101);assert.equal(t.context.state.draft.id,undefined);
 t.context.state.draft.distanceKm=2; t.context.window.__receiveNativeRide({ride:{...ride,endedAt:2000},message:'Ended'});assert.equal(t.context.state.draft.distanceKm,2);
 let before=t.messages.length;await t.context.persistLog(102,[t.context.state.draft]);assert.equal(t.messages.length,before);t.setOk(true);await t.context.persistLog(102,[t.context.state.draft]);assert.equal(t.messages.at(-1).action,'saved');
 t=setup();t.context.window.__receiveNativeRide({ride:{...ride,endedAt:2000},message:'Ended'});t.click('confirmDiscard');assert.equal(t.messages.at(-1).action,'discard');assert.equal(t.context.state.draft,null);
 t=setup();t.context.log.trips=[{nativeRideId:ride.id}];t.context.window.__receiveNativeRide({ride:{...ride,endedAt:2000},message:'Ended'});assert.equal(t.context.state.draft,null);assert.equal(t.messages.at(-1).action,'saved');
 t.context.log.trips=[{startedAt:1000,endedAt:2000,distanceKm:1.234,odometerStart:100,odometerEnd:101.234,type:'Služební',note:'quoted "text"'}];t.click('exportCsv');assert.equal(t.messages.at(-1).action,'export');assert.ok(t.messages.at(-1).csv.startsWith('\ufeff'));assert.ok(t.messages.at(-1).csv.includes('"1.234"'));assert.ok(t.messages.at(-1).csv.includes('"quoted ""text"""'));
 t=setup('https://example.com');assert.equal(t.messages.length,0);assert.equal(t.context.window.__receiveNativeRide,undefined);
 console.log('Passed: native start/stop, background snapshot, corrections, failed save retention, save ack, confirmed discard, duplicate recovery, CSV, origin guard');
})().catch(e=>{console.error(e);process.exit(1)});
