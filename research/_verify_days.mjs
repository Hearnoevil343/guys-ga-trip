import fs from 'fs';
const d=JSON.parse(fs.readFileSync('map/data/days.json','utf8'));
const spec=fs.readFileSync('research/backcountry-route-design.md','utf8').replace(/\s+/g,' ');
const hav=(a,b)=>{const R=6371000,t=x=>x*Math.PI/180;const dl=t(b[0]-a[0]),dg=t(b[1]-a[1]);const h=Math.sin(dl/2)**2+Math.cos(t(a[0]))*Math.cos(t(b[0]))*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
async function own(lat,lng){const u=`https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OWNERCLASSIFICATION&returnGeometry=false&f=json`;const j=await (await fetch(u)).json();return (j.features||[]).map(f=>f.attributes.ownerclassification).join('+')||'NONE';}
const seen=new Set();
for(const v of d.variants){console.log(`\n=== ${v.id}: ${v.label} (${v.days.length} days)`);let prevEnd=null;
 for(const day of v.days){ if(prevEnd){const g=hav([prevEnd.lat,prevEnd.lng],[day.start.lat,day.start.lng]);if(g>30)console.log(`  !! chain gap day ${day.day}: ${g.toFixed(0)}m`);} prevEnd=day.end;
  const bc=/Coosa|Wolf|Owltown|layover/i.test(day.title||'');if(!bc)continue;
  console.log(`Day ${day.day} ${day.date} ${day.title}${day.optional?' [optional]':''}`);let wm=0,wmin=0,pan=0,last=null;
  for(const l of day.legs){
   if(l.coords){let m=0,maxseg=0;for(let i=1;i<l.coords.length;i++){const s=hav(l.coords[i-1],l.coords[i]);m+=s;maxseg=Math.max(maxseg,s);}const mi=m/1609.34;
    const gap=last?hav(last,l.coords[0]):0;last=l.coords.at(-1);
    const flag=(Math.abs(mi-l.miles)>0.06?' !!MILES':'')+(gap>30?` !!GAP ${gap.toFixed(0)}m`:'')+(maxseg>150&&l.type==='walk'&&l.geometry_confidence==='exact'?` !!JUMP ${maxseg.toFixed(0)}m`:'');
    if(l.type==='walk'){wm+=mi;wmin+=l.minutes;console.log(`  walk ${l.miles}mi (mine ${mi.toFixed(2)}) +${l.gain_ft}ft ${l.minutes}min mph=${(l.miles/(l.minutes/60)).toFixed(1)} ${l.geometry_confidence}${l.access_confidence?' access:'+l.access_confidence:''}${flag} | ${l.label}`);}
    else console.log(`  ${l.type} ${l.miles}mi ${l.minutes}min${flag} | ${l.label}`);}
   else if(l.type==='pan'){pan+=l.minutes||l.duration_min||0;const st=l.legality?.panning?.state,cs=l.legality?.camping?.state;
    const txt=(l.legality?.panning?.text||'').replace(/\s+/g,' ');const verb=txt&&spec.includes(txt.slice(0,120));
    const key=`${l.lat},${l.lng}`;let o='';if(l.lat&&!seen.has(key)){seen.add(key);o=await own(l.lat,l.lng);}
    console.log(`  PAN ${l.minutes||l.duration_min}min pan=${st} camp=${cs} verbatim=${verb} gold=${l.gold?'y':'N'} @${l.lat},${l.lng} ${o} | ${l.label}`);}
  }
  console.log(`  -> walk ${wm.toFixed(2)}mi, moving ${wmin}min, pan ${pan}min`);
 }}
