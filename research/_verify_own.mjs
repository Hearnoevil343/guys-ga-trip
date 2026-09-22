import fs from 'fs';
const gj=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const want=process.argv.slice(3);
const hav=(a,b)=>{const R=6371000,t=x=>x*Math.PI/180;const dl=t(b[1]-a[1]),dg=t(b[0]-a[0]);const h=Math.sin(dl/2)**2+Math.cos(t(a[1]))*Math.cos(t(b[1]))*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
async function own(lng,lat){const u=`https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0/query?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=OWNERCLASSIFICATION&returnGeometry=false&f=json`;
 for(let i=0;i<3;i++){try{const j=await (await fetch(u)).json();const f=j.features||[];return f.length?f.map(x=>x.attributes.ownerclassification||x.attributes.OWNERCLASSIFICATION).join('+'):'NONE';}catch(e){await new Promise(r=>setTimeout(r,1500));}}return 'ERR';}
for(const name of want){
 const feats=gj.features.filter(f=>(f.properties.name||'')===name&&f.geometry.type==='LineString');
 console.log(`\n## ${name}: ${feats.length} feature(s)`);
 for(const f of feats){const c=f.geometry.coordinates;let d=0,next=0,out=[];
  for(let i=0;i<c.length;i++){if(i)d+=hav(c[i-1],c[i]);if(d>=next||i===c.length-1){out.push([d,c[i]]);next=d+250;}}
  let prev=null;for(const [dist,p] of out){const o=await own(p[0],p[1]);if(o!==prev){console.log(`${(dist/1609.34).toFixed(2)}mi ${p[1].toFixed(5)},${p[0].toFixed(5)} -> ${o}`);prev=o;}}
  console.log(`end ${(d/1609.34).toFixed(2)}mi`);}
}
