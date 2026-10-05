let photoGeneration=0,photoQueue=Promise.resolve(),photoLibrary=null;
const photoUrls={Start:null,End:null};
const photoVersions={Start:0,End:0};
function resetPhotoInputs(){
  photoGeneration++;
  for(const side of ['Start','End']){
    if(photoUrls[side]) URL.revokeObjectURL(photoUrls[side]);photoUrls[side]=null;
    for(const suffix of ['Camera','File','Value']) $('photo'+side+suffix).value='';
    $('photo'+side+'Preview').classList.add('hidden');$('photo'+side+'Preview').removeAttribute('src');
    $('photo'+side+'Candidates').classList.add('hidden');$('photo'+side+'Select').replaceChildren();$('photo'+side+'Status').textContent='';
  }
  $('photoConfirmed').checked=false;$('photoDifference').textContent='Nahraj obě fotky nebo doplň oba stavy.';
  $('photoPanel').open=false;
}
function photoValues(){
  const a=$('photoStartValue').value,b=$('photoEndValue').value;
  return {start:a.trim()===''?NaN:Number(a),end:b.trim()===''?NaN:Number(b)};
}
function updatePhotoDifference(){
  $('photoConfirmed').checked=false;
  if(state.draft?.manual)state.draft.photoDirty=true;
  const {start,end}=photoValues();
  $('photoDifference').textContent=Number.isFinite(start)&&Number.isFinite(end)
    ? end>start?'Rozdíl: '+(end-start).toLocaleString('cs-CZ',{minimumFractionDigits:3,maximumFractionDigits:3})+' km. Zkontroluj čísla a potvrď je.':'Konečný stav musí být vyšší než počáteční.'
    :'Doplň oba stavy tachometru.';
}
function extractOdometerCandidates(text){
  const matches=text.match(/\b\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d{1,3})?\b|\b\d{1,7}(?:[.,]\d{1,3})?\b/g)||[];
  const values=matches.map(s=>Number(s.replace(/[ \u00a0]/g,'').replace(',','.'))).filter(n=>Number.isFinite(n)&&n>=0&&n<10000000);
  return [...new Set(values)].sort((a,b)=>b-a);
}
function loadPhotoLibrary(){
  if(window.Tesseract)return Promise.resolve(window.Tesseract);
  if(!photoLibrary)photoLibrary=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='./vendor/tesseract-6.0.1.min.js';
    const timer=setTimeout(()=>{photoLibrary=null;reject(new Error('Rozpoznávání se nenačetlo včas. Zkontroluj internet nebo doplň číslo ručně.'));},20000);
    script.onload=()=>{clearTimeout(timer);window.Tesseract?resolve(window.Tesseract):reject(new Error('Rozpoznávání se nenačetlo.'))};
    script.onerror=()=>{clearTimeout(timer);photoLibrary=null;reject(new Error('Rozpoznávání není dostupné. Doplň čísla ručně.'))};document.head.append(script);
  });return photoLibrary;
}
async function photoCanvas(file){
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();
    const scale=Math.min(1,1800/Math.max(image.naturalWidth,image.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return canvas;
  }finally{URL.revokeObjectURL(url)}
}
async function readPhoto(side,file,generation,version){
  const current=()=>generation===photoGeneration&&version===photoVersions[side];
  if(!current())return;
  const status=$('photo'+side+'Status');let worker,timeout,timedOut=false;
  try{
    status.textContent='Načítám rozpoznávání… První načtení může chvíli trvat.';
    const canvas=await photoCanvas(file),Tesseract=await loadPhotoLibrary();
    if(!current())return;
    const work=(async()=>{
      worker=await Tesseract.createWorker('eng',1,{workerPath:'./vendor/tesseract-worker-6.0.1.min.js',workerBlobURL:false,logger:m=>{if(current()&&m.status==='recognizing text')status.textContent='Čtu tachometr… '+Math.round(m.progress*100)+' %';}});
      if(timedOut){await worker.terminate();throw new Error('Čtení trvalo příliš dlouho. Doplň číslo ručně.');}
      await worker.setParameters({tessedit_pageseg_mode:'11'});
      return worker.recognize(canvas);
    })();
    const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>{timedOut=true;reject(new Error('Čtení trvalo příliš dlouho. Doplň číslo ručně.'))},60000)});
    const result=await Promise.race([work,deadline]);
    if(!current())return;
    const candidates=extractOdometerCandidates(result.data.text);
    const select=$('photo'+side+'Select');select.replaceChildren();
    if(!candidates.length){status.textContent='Číslo se nepodařilo přečíst. Vyfoť jen displej celkových kilometrů zblízka, nebo číslo doplň ručně.';return;}
    for(const value of candidates){const option=document.createElement('option');option.value=String(value);option.textContent=value.toLocaleString('cs-CZ',{maximumFractionDigits:3})+' km';select.append(option)}
    $('photo'+side+'Candidates').classList.toggle('hidden',candidates.length===1);
    if(candidates.length===1){$('photo'+side+'Value').value=String(candidates[0]);status.textContent='Číslo přečteno. Zkontroluj jej podle fotky.';}
    else{const option=document.createElement('option');option.value='';option.textContent='Vyber stav celkových kilometrů';select.prepend(option);select.value='';status.textContent='Našel jsem více čísel. Vyber celkový stav kilometrů, ne denní počítadlo.';}
    updatePhotoDifference();
  }catch(err){if(current())status.textContent='Fotku nelze přečíst. '+(err.message||'Doplň číslo ručně.');}
  finally{clearTimeout(timeout);if(worker)await worker.terminate().catch(()=>{});}
}
function choosePhoto(side,file){
  if(!file||!state.draft?.manual)return;
  if(file.size>25000000){$('photo'+side+'Status').textContent='Fotka je příliš velká. Vyber soubor do 25 MB.';return;}
  // Queue OCR, so reading two photos does not exhaust mobile memory.
  const generation=photoGeneration,version=++photoVersions[side];
  if(photoUrls[side])URL.revokeObjectURL(photoUrls[side]);photoUrls[side]=URL.createObjectURL(file);
  const preview=$('photo'+side+'Preview');preview.src=photoUrls[side];preview.classList.remove('hidden');
  $('photo'+side+'Value').value='';$('photo'+side+'Candidates').classList.add('hidden');
  updatePhotoDifference();$('photo'+side+'Status').textContent='Fotka připravena ke čtení…';
  photoQueue=photoQueue.catch(()=>{}).then(()=>readPhoto(side,file,generation,version));
}
for(const side of ['Start','End']){
  for(const source of ['Camera','File'])$('photo'+side+source).addEventListener('change',e=>choosePhoto(side,e.target.files[0]));
  $('photo'+side+'Select').addEventListener('change',()=>{$('photo'+side+'Value').value=$('photo'+side+'Select').value;updatePhotoDifference()});
  $('photo'+side+'Value').addEventListener('input',updatePhotoDifference);
}
$('applyPhotoDistance').addEventListener('click',()=>{
  if(!state.draft?.manual)return;
  const {start,end}=photoValues();
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start){$('photoDifference').textContent='Vyplň platné stavy. Konečný musí být vyšší než počáteční.';return;}
  if(!$('photoConfirmed').checked){$('photoDifference').textContent='Nejdřív zaškrtni, že jsi oba stavy zkontroloval.';return;}
  const distance=Math.round((end-start)*1000)/1000;
  if(distance<=0){$('photoDifference').textContent='Rozdíl musí být alespoň 0,001 km.';return;}
  state.draft.odometerStart=start;state.draft.odometerEnd=end;state.draft.distanceKm=distance;state.draft.photoDirty=false;
  state.draft.carOdometerEnd=end;$('carOdometerEnd').value=String(end).replace('.',',');
  $('correctedKm').value=distance.toFixed(3);$('finalDistance').textContent=distance.toFixed(3);$('finalOdometer').textContent=formatOdometer(end);
  $('photoDifference').textContent='Použito: '+start.toLocaleString('cs-CZ')+' → '+end.toLocaleString('cs-CZ')+' km. Ujeto '+distance.toLocaleString('cs-CZ',{maximumFractionDigits:3})+' km. Nyní můžeš uložit jízdu.';
});
$('clearPhotos').addEventListener('click',()=>{
  if(state.draft?.manual){state.draft.photoDirty=false;state.draft.odometerStart=loadOdometer();state.draft.distanceKm=0;state.draft.odometerEnd=loadOdometer();$('correctedKm').value='0.000';$('finalDistance').textContent='0.000';$('finalOdometer').textContent=formatOdometer(loadOdometer())}
  resetPhotoInputs();
});
