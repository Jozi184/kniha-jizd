/* Email/password accounts. Public key is restricted by per-user database RLS. */
window.rideAccount = (() => {
  const url='https://njohgxfvntmjzivkwfyv.supabase.co';
  const key='sb_publishable_Zh0UNzNpaGv5GbkvbTTr1Q_fODrar7h';
  let recovering=location.hash.includes('type=recovery');
  const client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'kniha-jizd-account'}});
  let user=null, mode='login', resolving=null;
  const $=id=>document.getElementById(id);
  const redirect=location.origin+location.pathname;
  const friendly=error=>{
    const text=error?.message||'Zkontroluj připojení a zkus to znovu.';
    if(/invalid login/i.test(text))return 'E-mail nebo heslo nesouhlasí.';
    if(/email not confirmed/i.test(text))return 'Nejdřív potvrď e-mail odkazem ve své schránce.';
    if(/rate limit|too many/i.test(text))return 'Příliš mnoho pokusů. Počkej chvíli a zkus to znovu.';
    if(/email address not authorized|sending emails/i.test(text))return 'Odesílání na tuto adresu zatím není povolené. Použij e-mail vlastníka projektu nebo nastav e-mailovou službu v Supabase.';
    return text;
  };
  function setMode(value) {
    mode=value;
    $('authTitle').textContent={login:'Přihlásit se',signup:'Vytvořit účet',reset:'Obnovit heslo',update:'Nové heslo'}[mode];
    $('authSubmit').textContent={login:'Přihlásit se',signup:'Vytvořit účet',reset:'Poslat odkaz',update:'Uložit nové heslo'}[mode];
    $('authPasswordField').classList.toggle('hidden',mode==='reset');
    $('authEmailField').classList.toggle('hidden',mode==='update');
    $('authPassword').required=mode!=='reset';$('authPassword').minLength=mode==='login'?1:8;
    $('authPassword').autocomplete=mode==='login'?'current-password':'new-password';
    $('authEmail').required=mode!=='update';
    $('authHint').textContent=mode==='signup'?'Použij stejné přihlášení v iPhonu i na PC. Heslo musí mít alespoň 8 znaků.':'Jízdy se ukládají k tvému účtu a synchronizují mezi zařízeními.';
    $('authStatus').textContent='';
  }
  function showLogin() {$('authPanel').classList.remove('hidden');$('logApp').classList.add('hidden');}
  function showApp() {$('authPanel').classList.add('hidden');$('logApp').classList.remove('hidden');$('accountEmail').textContent=user?.email||'';}
  async function open(session) {
    if(!session?.user){user=null;showLogin();return;}
    user=session.user;
    if(resolving){resolving(session);resolving=null;}
    showApp();
    if(typeof initializeLog==='function') await initializeLog();
  }
  async function session() {
    const {data,error}=await client.auth.getSession();if(error)throw error;
    if(!data.session)throw new Error('Přihlas se k účtu.');return data.session;
  }
  async function log(method,body) {
    const s=await session();
    if(method==='GET'){
      const {data,error}=await client.from('ride_logs').select('odometer_km,trips,revision').eq('user_id',s.user.id).maybeSingle();
      if(error)throw error;
      return data?{odometerKm:Number(data.odometer_km),trips:data.trips,revision:Number(data.revision)}:{odometerKm:0,trips:[],revision:0,empty:true};
    }
    const {data,error}=await client.rpc('save_ride_log',{p_odometer:body.odometerKm,p_trips:body.trips,p_revision:body.revision});
    if(error)throw error;return data;
  }
  async function fetchMap(action,body,signal) {
    const s=await session();
    return fetch(url+'/functions/v1/ride-maps',{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+s.access_token},body:JSON.stringify({action,...body}),signal});
  }
  async function boot() {
    $('authLogin').onclick=()=>setMode('login');$('authSignup').onclick=()=>setMode('signup');$('authReset').onclick=()=>setMode('reset');
    $('authForm').addEventListener('submit',async event=>{
      event.preventDefault();const button=$('authSubmit');button.disabled=true;$('authStatus').textContent='Chvilku strpení…';
      const email=$('authEmail').value.trim(),password=$('authPassword').value;
      try{
        if(mode==='reset'){
          const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:redirect});if(error)throw error;
          $('authStatus').textContent='Pokud účet existuje, najdeš ve schránce odkaz na obnovení hesla. Můžeš ho také vložit níže.';return;
        }
        if(mode==='update'){
          const {error}=await client.auth.updateUser({password});if(error)throw error;
          recovering=false;$('authPassword').value='';await open((await client.auth.getSession()).data.session);return;
        }
        const result=mode==='signup'?await client.auth.signUp({email,password,options:{emailRedirectTo:redirect}}):await client.auth.signInWithPassword({email,password});
        if(result.error)throw result.error;
        $('authPassword').value='';
        if(result.data.session)await open(result.data.session);
        else $('authStatus').textContent='Potvrď svůj e-mail odkazem ve schránce a potom se přihlas. Pokud odkaz neotevře aplikaci, zkopíruj jej a vlož níže.';
      }catch(error){$('authStatus').textContent=friendly(error);}finally{button.disabled=false;}
    });
    $('verifyLink').onclick=async()=>{
      $('verifyLink').disabled=true;
      try{
        const link=new URL($('emailLink').value.trim());
        if(link.origin!==url||link.pathname!=='/auth/v1/verify')throw new Error('Vlož potvrzovací odkaz z e-mailu Knihy jízd.');
        const token_hash=link.searchParams.get('token_hash')||link.searchParams.get('token');
        const type=link.searchParams.get('type');
        if(!token_hash||!['signup','recovery','email'].includes(type))throw new Error('Odkaz není platný.');
        const {data,error}=await client.auth.verifyOtp({token_hash,type});if(error)throw error;
        $('emailLink').value='';
        if(type==='recovery'){setMode('update');showLogin();}
        else await open(data.session);
      }catch(error){$('authStatus').textContent=friendly(error);}finally{$('verifyLink').disabled=false;}
    };
    $('signOut').onclick=async()=>{
      if(typeof state!=='undefined'&&(state.startedAt||state.draft)){alert('Nejdřív ulož nebo zahoď rozepsanou jízdu.');return;}
      const {error}=await client.auth.signOut();if(error){$('storageStatus').textContent=friendly(error);return;}
      user=null;showLogin();location.reload();
    };
    client.auth.onAuthStateChange((event,s)=>{
      if(event==='PASSWORD_RECOVERY'){recovering=true;setMode('update');showLogin();return;}
      if(event==='SIGNED_OUT'){user=null;showLogin();}
      if(event==='TOKEN_REFRESHED'&&s)user=s.user;
    });
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden||!user||typeof state==='undefined'||state.startedAt||state.draft||storageBusy)return;
      initializeLog();
    });
    setMode('login');
    try {
      const {data,error}=await client.auth.getSession();if(error)throw error;
      if(recovering){user=data.session?.user||null;setMode('update');showLogin();}
      else await open(data.session);
    }catch(error){showLogin();$('authStatus').textContent=friendly(error);}
  }
  async function ready() {
    if(user)return (await client.auth.getSession()).data.session;
    return new Promise(resolve=>{resolving=resolve;});
  }
  return {boot,ready,log,fetchMap,get user(){return user;}};
})();
