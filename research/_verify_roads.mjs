import fs from 'fs';
const gj=JSON.parse(fs.readFileSync('_coosa_osm.geojson','utf8'));
const hav=(a,b)=>{const R=6371000,t=x=>x*Math.PI/180;const dl=t(b[1]-a[1]),dg=t(b[0]-a[0]);const h=Math.sin(dl/2)**2+Math.cos(t(a[1]))*Math.cos(t(b[1]))*Math.sin(dg/2)**2;return 2*R*Math.asin(Math.sqrt(h));};
const len=c=>c.slice(1).reduce((s,p,i)=>s+hav(c[i],p),0);
const names=['Duncan Ridge Conn','Bowers Road','Big Grassy Knob Road','Duncan Ridge Road','Calf Stomp Road','West Wolf Creek Road'];
const lines=gj.features.filter(f=>f.geometry.type==='LineString');
const creek=lines.find(f=>f.properties.name==='East Fork Coosa Creek').geometry.coordinates;
const dmin=(p,c)=>Math.min(...c.map(q=>hav(p,q)));
for(const n of names){for(const f of lines.filter(f=>f.properties.name===n)){const c=f.geometry.coordinates;const P=f.properties;
 console.log(`\n${n} [${P.highway}] ref=${P.ref||''} surface=${P.surface||''} access=${P.access||''} len=${(len(c)/1609.34).toFixed(2)}mi`);
 console.log(' start',c[0][1].toFixed(5),c[0][0].toFixed(5),' end',c.at(-1)[1].toFixed(5),c.at(-1)[0].toFixed(5));
 // touching features at endpoints
 for(const [lab,e] of [['start',c[0]],['end',c.at(-1)]]){const t=lines.filter(g=>g!==f&&g.properties.highway&&g.geometry.coordinates.some(q=>hav(e,q)<25)).map(g=>(g.properties.name||'unnamed')+'/'+g.properties.highway);console.log('  '+lab+' touches:',[...new Set(t)].join('; ')||'-');}
 const near=c.filter(p=>dmin(p,creek)<100);console.log('  pts within 100m of EF Coosa Creek:',near.length,'of',c.length, near.length?`from ${near[0][1].toFixed(5)},${near[0][0].toFixed(5)} to ${near.at(-1)[1].toFixed(5)},${near.at(-1)[0].toFixed(5)}`:'');
}}
