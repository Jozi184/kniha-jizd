const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../account.js'),'utf8');
const elements={};const $=id=>elements[id]??=( {value:'',disabled:false,classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this[type]=fn;}} );
let active=null,confirmed=false,readCount=0,params;
const auth={getSession:async()=>({data:{session:active}}),onAuthStateChange(){},signInWithPassword:async({email,password})=>password==='correct'?{data:{session:active={user:{id:'alice',email},access_token:'user-token'}}}:{error:{message:'Invalid login credentials'}},signUp:async()=>({data:{session:null}}),verifyOtp:async(args)=>{params=args;return{data:{session:active}}},signOut:async()=>{active=null;return{}},resetPasswordForEmail:async()=>({}),updateUser:async()=>({})};
const client={auth,from:()=>({select:()=>({eq:(column,id)=>({maybeSingle:async()=>{assert.equal(column,'user_id');assert.equal(id,'alice');return{data:{odometer_km:124.567,trips:[],revision:2}}}})})}),rpc:async(name,args)=>{assert.equal(name,'save_ride_log');assert.equal(args.p_revision,2);return {data:{revision:3}}}};
const context={window:{supabase:{createClient:()=>client}},document:{getElementById:$,addEventListener(){}},location:{hash:'',origin:'https://jozi184.github.io',pathname:'/kniha-jizd/index.html',reload(){}},URL,initializeLog:async()=>readCount++,fetch:async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer user-token');return{ok:true}},alert(){}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
const account=context.window.rideAccount;await account.boot();assert.equal(account.user,null);
$('authEmail').value='alice@example.com';$('authPassword').value='wrong';await $('authForm').submit({preventDefault(){}});assert.match($('authStatus').textContent,/nesouhlasí/);assert.equal(readCount,0);
$('authPassword').value='correct';await $('authForm').submit({preventDefault(){}});assert.equal(account.user.id,'alice');assert.equal(readCount,1);
assert.equal((await account.log('GET')).revision,2);assert.equal((await account.log('PUT',{odometerKm:125,trips:[],revision:2})).revision,3);await account.fetchMap('places',{});
$('emailLink').value='https://evil.example/auth/v1/verify?token=abc&type=signup';await $('verifyLink').onclick();assert.match($('authStatus').textContent,/Vlož potvrzovací/);
$('emailLink').value='https://njohgxfvntmjzivkwfyv.supabase.co/auth/v1/verify?token=abc&type=recovery';await $('verifyLink').onclick();assert.equal(params.type,'recovery');assert.equal($('authTitle').textContent,'Nové heslo');
console.log('Passed: failed/successful login, private reads, revision writes, authorized maps, email-link origin guard and password recovery');
})().catch(error=>{console.error(error);process.exit(1)});
