(function(){
"use strict";
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const slug=s=>norm(s).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const fmt=n=>new Intl.NumberFormat("es-CO").format(n);
const plural=(n,a,b)=>`${fmt(n)} ${n===1?a:b}`;
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;

const C={ocean0:"#1E3037",ocean1:"#0B1417",land:"#3C4734",landLine:"#56634A",landDim:"#2C3527",
  cherry:"#E4675B",cherryHi:"#F28C80",cherryDim:"rgba(228,103,91,.45)",ink:"#E6E9DD",grat:"rgba(230,233,221,.05)",
  depFill:"#4C5941",depLine:"#6E7D60",munLine:"rgba(230,233,221,.16)",sel:"#4F5C44"};

/* ---------- productos: variedad y proceso ---------- */
const VAR=[["Pink Bourbon"],["Red Bourbon"],["Yellow Bourbon"],["Bourbon Sidra","Sidra"],["Bourbon Aji"],["Pacamara","Yellow Pacamara"],
  ["Geisha","Gesha"],["Maracaturra"],["Yellow Caturra"],["Red Caturra"],["Catuaí","Red & Yellow Catuai","Red Catuai","Yellow Catuai","Catuai Rojo","Catuai Amarillo","Catuai"],
  ["Caturra"],["Castillo"],["Sudan Rume","Rume Sudan"],["SL28","SL 28"],["Catigua"],["Obata"],["Centroamericano"],["Garnica"],["Catimor"],
  ["Villa Sarchí","Villa Sarchi"],["Marsellesa"],["Parainema"],["Lempira"],["Mundo Novo"],["Java"],
  ["Laurina"],["Chiroso"],["Typica","Típica","Tipica"],["Moka"],["Tabi"],["Papayo"],["Catiope"],["Yirgacheffe"],["Bourbon","Borbón"],["Blend"]];
const VRE=VAR.map(g=>g.map(v=>new RegExp("(^|[^a-z0-9])"+norm(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/ /g,"\\s*")+"(?=$|[^a-z0-9])")));
const PROC=[[/doble? anaerob|double anaerob/,"Doble anaeróbico"],[/anaerob/,"Anaeróbico"],[/carbonic maceration|maceracion carbonica/,"Maceración carbónica"],
  [/macerad|maceration/,"Macerado"],[/semi[\s-]?washed|semi ?lavado/,"Semilavado"],
  [/black honey/,"Black honey"],[/red honey/,"Red honey"],[/yellow honey/,"Yellow honey"],[/white honey/,"White honey"],[/full honey/,"Full honey"],
  [/hidro honey/,"Hidro honey"],[/\bhoney\b|\bmiel\b/,"Honey"],[/doble? natural|double natural/,"Doble natural"],[/\bnatural\b/,"Natural"],
  [/reposad/,"Reposado"],[/\bwashe?d?\b|\blavado\b/,"Lavado"],[/decaf|descafeinado/,"Descafeinado"],[/organic|organico/,"Orgánico"],[/fair trade|comercio justo/,"Comercio justo"]];
const SKIP={"Honey":["Black honey","Red honey","Yellow honey","White honey","Full honey","Hidro honey"],"Natural":["Doble natural"],"Anaeróbico":["Doble anaeróbico"],"Lavado":["Semilavado"]};
function parseProduct(name,finca,prov){
  let low=" "+norm(name)+" ";
  const vars=[];
  VRE.forEach((group,gi)=>{for(const re of group){ if(re.test(low)){vars.push(VAR[gi][0]);low=low.replace(re," ");break;} }});
  let pl=" "+norm(name)+" ";pl=pl.replace(/\bwh?ith?out decaf\b/g," ");
  const procs=[];
  for(const [re,lab] of PROC){ if(re.test(pl)&&!(SKIP[lab]||[]).some(x=>procs.includes(x))) procs.push(lab); }
  let title=name;
  if(/^coffeelipe,/i.test(title)) title=title.replace(/^coffeelipe,\s*/i,"");
  else{
    const parts=title.split(/\s+-\s+/);
    const own=new Set(norm(finca+" "+prov).split(" ").filter(w=>w.length>3));
    if(parts.length>1&&norm(parts[0]).split(" ").some(w=>own.has(w))) title=parts.slice(1).join(" - ");
  }
  title=title.replace(/[\s\-–]+$/,"");
  return {title:title||name,vars:vars.filter(v=>v!=="Blend"||vars.length===1),procs};
}

/* ---------- estado ---------- */
let RED,WORLD;
const S={level:0,pais:null,reg:null,mun:null,prov:null};
const IDX={paises:new Map(),proveedores:[]};
let W=0,H=0,DPR=1,view={x:0,y:0,w:0,h:0};
const proj=d3.geoOrthographic().clipAngle(90).precision(.4);
const cv=$("#cv"),ctx=cv.getContext("2d");
const path=d3.geoPath(proj,ctx);
let rot=[84,-10,0],scale=300,anim=null,lastInteract=0,hover=null;
const grat=d3.geoGraticule10();

/* ---------- carga ---------- */
Promise.all([d3.json("data/red.json"),d3.json("data/mundo.json")]).then(async([red,world])=>{
  RED=red;WORLD=world;
  const geos=await Promise.all(RED.paises.map(p=>d3.json(`data/${p.iso3}.json`)));
  RED.paises.forEach((p,pi)=>{
    p.slug=slug(p.nombre);IDX.paises.set(p.iso3,p);
    const feats=geos[pi].features;
    p.base=feats.filter(f=>f.properties.t==="base");
    p.extra=feats.filter(f=>f.properties.t==="reg");
    p.feat={type:"FeatureCollection",features:p.base};
    p.nProv=0;p.nProd=0;
    for(const r of p.regiones){
      r.slug=slug(r.name);r.pais=p;
      r.feats=[...p.base,...p.extra].filter(f=>(f.properties.reg||[]).includes(r.name));
      r.fc={type:"FeatureCollection",features:r.feats};
      r.units=feats.filter(f=>(f.properties.t==="unit"||f.properties.t==="mun")&&f.properties.reg===r.name);
      r.nProv=0;r.nProd=0;
      for(const m of r.municipios){
        m.slug=slug(m.name);m.reg=r;
        m.feat=r.units.find(f=>f.properties.mun===m.name)||null;
        for(const v of m.proveedores){
          v.slug=slug(v.id);v.mun=m;
          const g=new Map();
          for(const x of v.productos){const k=x.nombre;if(!g.has(k))g.set(k,{nombre:k,finca:x.finca,n:0});g.get(k).n++;}
          v.items=[...g.values()].map(x=>({...parseProduct(x.nombre,x.finca,v.nombre),raw:x.nombre,n:x.n}));
          r.nProv++;r.nProd+=v.productos.length;
          IDX.proveedores.push(v);
        }
      }
      p.nProv+=r.nProv;p.nProd+=r.nProd;
    }
    p.regiones.sort((a,b)=>b.nProv-a.nProv||a.name.localeCompare(b.name));
  });
  RED.paises.sort((a,b)=>b.nProv-a.nProv);
  $("#loading").remove();
  resize();
  if(!fromHash(true)) go({level:0},true);
  requestAnimationFrame(loop);
}).catch(e=>{$("#loading").textContent="No se pudieron cargar los datos ("+e.message+").";console.error(e);});

/* ---------- tamaño y vista ---------- */
function resize(){
  DPR=Math.min(2,window.devicePixelRatio||1);
  W=innerWidth;H=innerHeight;
  cv.width=W*DPR;cv.height=H*DPR;
  const mobile=W<=760,top=(mobile?52:56);
  if(mobile){const ph=$("#panel").getBoundingClientRect().height||H*.46;view={x:0,y:top,w:W,h:Math.max(200,H-ph-top)};}
  else{view={x:0,y:top,w:W-400-28,h:H-top-14};}
  proj.translate([view.x+view.w/2,view.y+view.h/2]);
  if(!anim&&RED){const t=target();if(t)scale=t.scale;}
  draw();
}
addEventListener("resize",resize);

function worldScale(){return Math.min(view.w,view.h)/2*0.88;}
function fitScale(obj,center,pad){
  const p=d3.geoOrthographic().clipAngle(90).rotate([-center[0],-center[1],0]).translate([0,0]).scale(1);
  const b=d3.geoPath(p).bounds(obj);
  const bw=Math.max(1e-4,b[1][0]-b[0][0]),bh=Math.max(1e-4,b[1][1]-b[0][1]);
  return Math.min(view.w*pad/bw,view.h*pad/bh);
}
function regionObj(r){
  // polígonos de la región + puntos de sus municipios (por si alguno queda por fuera)
  return {type:"FeatureCollection",features:[...r.feats,...r.municipios.map(m=>({type:"Feature",geometry:{type:"Point",coordinates:m.c}}))]};
}
function target(){
  if(S.level===0){
    const c=d3.geoCentroid({type:"MultiPoint",coordinates:RED.paises.map(p=>p.centro)});
    return {rot:[-c[0],-c[1],0],scale:worldScale()};
  }
  const p=S.pais;
  if(S.level===1){const c=d3.geoCentroid(p.feat);return {rot:[-c[0],-c[1],0],scale:fitScale(p.feat,c,.86)};}
  const r=S.reg,ro=regionObj(r),rc=d3.geoCentroid(ro),rs=fitScale(ro,rc,.84);
  if(S.level===2) return {rot:[-rc[0],-rc[1],0],scale:rs};
  const m=S.mun;
  if(!m.feat) return {rot:[-m.c[0],-m.c[1],0],scale:rs*1.4};
  const c=d3.geoCentroid(m.feat);
  return {rot:[-c[0],-c[1],0],scale:Math.max(rs,Math.min(fitScale(m.feat,c,.5),rs*3.2))};
}

/* ---------- animación ---------- */
function flyTo(t,instant){
  if(!t) return;
  const r0=rot.slice(),s0=scale,r1=t.rot,s1=t.scale;
  if(instant||reduce){rot=r1;scale=s1;anim=null;draw();return;}
  const a=[-r0[0],-r0[1]],b=[-r1[0],-r1[1]];
  const gi=d3.geoInterpolate(a,b),dist=d3.geoDistance(a,b);
  const ls0=Math.log(s0),ls1=Math.log(s1);
  const dip=Math.min(.75,dist*1.1)*(Math.max(s0,s1)>worldScale()*1.5?1:.35);
  const dur=900+Math.min(900,dist*900+Math.abs(ls1-ls0)*180);
  const t0=performance.now();
  anim={step(now){
    const k=Math.min(1,(now-t0)/dur),e=d3.easeCubicInOut(k);
    const c=gi(e);rot=[-c[0],-c[1],0];
    scale=Math.exp(ls0+(ls1-ls0)*e)*(1-dip*Math.sin(Math.PI*e));
    scale=Math.max(scale,Math.min(s0,s1,worldScale())*.9);
    if(k>=1){rot=r1;scale=s1;anim=null;}
  }};
}
function loop(now){
  if(anim){anim.step(now);draw();}
  else if(!reduce&&S.level===0&&!drag&&now-lastInteract>4000){rot[0]+=0.04;draw();}
  requestAnimationFrame(loop);
}

/* ---------- dibujo ---------- */
function visible(lonlat){const c=proj.invert(proj.translate());return c&&d3.geoDistance(lonlat,c)<Math.PI/2-0.03;}
function fillStroke(f,fill,stroke,lw){ctx.beginPath();path(f);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||.7;ctx.stroke();}}
function isHover(kind,obj){return hover&&hover.kind===kind&&hover.obj===obj;}
function draw(){
  if(!WORLD) return;
  proj.rotate(rot).scale(scale);
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,W,H);
  const [cx,cy]=proj.translate();
  const halo=ctx.createRadialGradient(cx,cy,scale*.98,cx,cy,scale*1.18);
  halo.addColorStop(0,"rgba(125,184,138,.16)");halo.addColorStop(1,"rgba(125,184,138,0)");
  ctx.fillStyle=halo;ctx.beginPath();ctx.arc(cx,cy,scale*1.18,0,2*Math.PI);ctx.fill();
  const g=ctx.createRadialGradient(cx-scale*.35,cy-scale*.4,scale*.05,cx,cy,scale);
  g.addColorStop(0,C.ocean0);g.addColorStop(1,C.ocean1);
  ctx.fillStyle=g;ctx.beginPath();path({type:"Sphere"});ctx.fill();
  ctx.beginPath();path(grat);ctx.strokeStyle=C.grat;ctx.lineWidth=1;ctx.stroke();

  const deep=S.level>=1;
  for(const f of WORLD.features){
    const p=IDX.paises.get(f.properties.iso3);
    if(deep&&p===S.pais) continue;
    let fill;
    if(!deep) fill=p?(isHover("pais",p)?C.cherryHi:C.cherry):C.land;
    else fill=p?(isHover("pais",p)?C.cherry:C.cherryDim):C.landDim;
    fillStroke(f,fill,deep?"rgba(86,99,74,.6)":C.landLine,.6);
  }
  if(deep) drawCountry(S.pais);
  const sh=ctx.createRadialGradient(cx-scale*.4,cy-scale*.45,scale*.2,cx,cy,scale*1.02);
  sh.addColorStop(0,"rgba(255,255,255,.05)");sh.addColorStop(.7,"rgba(0,0,0,0)");sh.addColorStop(1,"rgba(0,0,0,.35)");
  ctx.fillStyle=sh;ctx.beginPath();path({type:"Sphere"});ctx.fill();
  ctx.beginPath();path({type:"Sphere"});ctx.strokeStyle="rgba(125,184,138,.25)";ctx.lineWidth=1;ctx.stroke();
  drawLabels();
}
function regionOf(f){const p=S.pais;const n=(f.properties.reg||[])[0];return n?p.regiones.find(r=>r.name===n):null;}
function drawCountry(p){
  const L=S.level;
  // provincias / departamentos de fondo
  for(const f of p.base){
    const r=regionOf(f);
    let fill,stroke=L===1?C.depLine:"rgba(110,125,96,.7)",lw=L===1?.8:.7;
    if(L===1) fill=r?(isHover("reg",r)?C.cherryHi:C.cherry):C.depFill;
    else{ const sel=r&&r===S.reg; fill=sel?C.sel:(r&&isHover("reg",r)?"#3A4433":C.landDim); if(r&&!sel){stroke="rgba(228,103,91,.55)";lw=1.1;} }
    fillStroke(f,fill,stroke,lw);
  }
  // regiones cafeteras dibujadas con cantones o municipios
  for(const f of p.extra){
    const r=regionOf(f);
    if(L===1) fillStroke(f,isHover("reg",r)?C.cherryHi:C.cherry,"rgba(255,235,228,.35)",.6);
    else{ const sel=r===S.reg; fillStroke(f,sel?C.sel:(isHover("reg",r)?"#3A4433":null),sel?null:"rgba(228,103,91,.6)",1.1); }
  }
  if(L>=2){
    const r=S.reg;
    for(const f of r.units){
      const m=f.properties.mun?r.municipios.find(x=>x.name===f.properties.mun):null;
      if(m){
        const sel=S.mun===m;
        ctx.globalAlpha=sel||L===2?1:.6;
        fillStroke(f,sel||isHover("mun",m)?C.cherryHi:C.cherry,"rgba(255,235,228,.55)",.9);
        ctx.globalAlpha=1;
      }else fillStroke(f,null,C.munLine,.6);
    }
    for(const f of r.feats) fillStroke(f,null,"rgba(230,233,221,.75)",1.6);
  }
}
function label(txt,x,y,o){
  o=o||{};
  ctx.font=`${o.weight||600} ${o.size||12.5}px "Instrument Sans",system-ui,sans-serif`;
  ctx.textAlign="center";ctx.textBaseline="middle";
  ctx.lineWidth=3.5;ctx.strokeStyle="rgba(14,17,12,.85)";ctx.lineJoin="round";ctx.strokeText(txt,x,y);
  ctx.fillStyle=o.color||C.ink;ctx.fillText(txt,x,y);
}
function badge(n,x,y,hot,dashed){
  const r=n>99?14:n>9?12:10.5;
  ctx.beginPath();ctx.arc(x,y,r+2.5,0,2*Math.PI);ctx.fillStyle="rgba(14,17,12,.65)";ctx.fill();
  ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fillStyle=hot?"#fff":C.ink;ctx.fill();
  if(dashed){ctx.setLineDash([3,2.5]);ctx.strokeStyle=C.cherry;ctx.lineWidth=1.6;ctx.stroke();ctx.setLineDash([]);}
  ctx.font=`500 12px "IBM Plex Mono",monospace`;ctx.fillStyle="#1A1F16";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(n,x,y+.5);
}
function markers(){
  // lo que se marca con número en el nivel actual
  if(S.level===0) return RED.paises.map(p=>({kind:"pais",o:p,c:p.centro,n:p.nProv,name:p.nombre}));
  if(S.level===1) return S.pais.regiones.map(r=>({kind:"reg",o:r,c:r.c,n:r.nProv,name:r.name}));
  return S.reg.municipios.map(m=>({kind:"mun",o:m,c:m.c,n:m.proveedores.length,name:m.ok==="sin"?"Sin municipio":m.name,dashed:m.ok!=="ok"}));
}
function drawLabels(){
  if(anim&&!reduce) return;
  const sel=S.level>=3?S.mun:null;
  const ms=markers().filter(it=>visible(it.c)).sort((a,b)=>(b.o===sel)-(a.o===sel)||b.n-a.n);
  const pos=ms.map(m=>proj(m.c)),boxes=[],shown=[];
  ms.forEach((m,i)=>{const [x,y]=pos[i];
    const hit=boxes.some(b=>x+13>b[0]&&x-13<b[2]&&y+13>b[1]&&y-13<b[3]);
    if(hit&&S.level===0&&!isHover(m.kind,m.o)) return;   // en el mundo, los números que se tapan se omiten
    boxes.push([x-13,y-13,x+13,y+13]);shown.push(i);});
  shown.forEach(i=>{const m=ms[i],[x,y]=pos[i];badge(m.n,x,y,m.o===sel||isHover(m.kind,m.o),m.dashed);});
  shown.forEach(i=>{
    const m=ms[i],[x,y]=pos[i],isSel=m.o===sel,size=isSel?14:12.5;
    ctx.font=`600 ${size}px "Instrument Sans",system-ui,sans-serif`;
    const w=ctx.measureText(m.name).width/2+3,h=size/2+3;
    const cands=[[x,y+21],[x,y-22],[x+w+15,y],[x-w-15,y]];
    const free=cands.find(([cx,cy])=>!boxes.some(b=>cx-w<b[2]&&cx+w>b[0]&&cy-h<b[3]&&cy+h>b[1]));
    if(!free&&!isSel&&!isHover(m.kind,m.o)) return;
    const [lx,ly]=free||cands[0];
    boxes.push([lx-w,ly-h,lx+w,ly+h]);
    label(m.name,lx,ly,{size,color:isSel?"#fff":C.ink});
  });
}

/* ---------- interacción en el globo ---------- */
const pts=new Map();let drag=null,pinch=null;
cv.addEventListener("pointerdown",e=>{
  cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,[e.clientX,e.clientY]);
  lastInteract=performance.now();anim=null;
  if(pts.size===1) drag={x:e.clientX,y:e.clientY,r:rot.slice(),moved:0};
  if(pts.size===2){const [a,b]=[...pts.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),s:scale};drag=null;}
});
cv.addEventListener("pointermove",e=>{
  if(pts.has(e.pointerId)) pts.set(e.pointerId,[e.clientX,e.clientY]);
  if(pinch&&pts.size===2){const [a,b]=[...pts.values()];setScale(pinch.s*Math.hypot(a[0]-b[0],a[1]-b[1])/pinch.d);return;}
  if(drag){
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved=Math.max(drag.moved,Math.hypot(dx,dy));
    if(drag.moved>4){cv.classList.add("drag");const k=180/Math.PI/scale;
      rot=[drag.r[0]+dx*k,Math.max(-85,Math.min(85,drag.r[1]-dy*k)),0];draw();hideTip();}
    return;
  }
  if(e.pointerType==="mouse") doHover(e.clientX,e.clientY);
});
cv.addEventListener("pointerup",e=>{
  const wasClick=drag&&drag.moved<=4&&pts.size===1;
  pts.delete(e.pointerId);if(pts.size<2)pinch=null;
  cv.classList.remove("drag");
  if(wasClick) pick(e.clientX,e.clientY);
  drag=null;lastInteract=performance.now();
});
cv.addEventListener("pointercancel",e=>{pts.delete(e.pointerId);drag=null;pinch=null;cv.classList.remove("drag");});
cv.addEventListener("pointerleave",()=>{if(!drag){hover=null;hideTip();cv.classList.remove("hot");draw();}});
cv.addEventListener("wheel",e=>{e.preventDefault();lastInteract=performance.now();anim=null;setScale(scale*Math.exp(-e.deltaY*.0015));},{passive:false});
function setScale(s){scale=Math.max(worldScale()*.7,Math.min(worldScale()*600,s));draw();}
$("#zin").onclick=()=>{anim=null;lastInteract=performance.now();setScale(scale*1.5);};
$("#zout").onclick=()=>{anim=null;lastInteract=performance.now();setScale(scale/1.5);};

function hit(x,y){
  for(const m of markers()){ if(!visible(m.c))continue; const p=proj(m.c); if(Math.hypot(p[0]-x,p[1]-y)<16) return {kind:m.kind,obj:m.o}; }
  const ll=proj.invert([x,y]),cen=proj.invert(proj.translate());
  if(!ll||d3.geoDistance(ll,cen)>=Math.PI/2) return null;
  const inside=f=>d3.geoContains(f,ll);
  if(S.level>=2){
    const r=S.reg;
    for(const m of r.municipios) if(m.feat&&inside(m.feat)) return {kind:"mun",obj:m};
    for(const f of r.units) if(inside(f)) return {kind:"vacio",obj:{name:f.properties.name}};
  }
  if(S.level>=1){
    const p=S.pais;
    for(const f of p.extra) if(inside(f)) return {kind:"reg",obj:regionOf(f)};
    for(const f of p.base) if(inside(f)){const r=regionOf(f);return r?{kind:"reg",obj:r}:{kind:"vacio",obj:{name:f.properties.name.replace(/^(Provincia|Departamento) (de )?/,"")}};}
  }
  const f=WORLD.features.find(inside);
  if(!f) return null;
  const p=IDX.paises.get(f.properties.iso3);
  return p?{kind:"pais",obj:p}:{kind:"vacio",obj:{name:f.properties.name}};
}
function doHover(x,y){
  const h=hit(x,y);
  const prev=hover;
  hover=h&&h.kind!=="vacio"?h:null;
  cv.classList.toggle("hot",!!hover);
  if(h) showTip(h,x,y); else hideTip();
  if((prev&&prev.obj)!==(hover&&hover.obj)) draw();
}
function tipText(h){
  const o=h.obj;
  if(h.kind==="pais") return `<b>${esc(o.nombre)}</b> <span>· ${plural(o.nProv,"proveedor","proveedores")}</span>`;
  if(h.kind==="reg") return `<b>${esc(o.name)}</b> <span>· ${plural(o.nProv,"proveedor","proveedores")}</span>`;
  if(h.kind==="mun") return `<b>${esc(o.ok==="sin"?"Sin municipio":o.name)}</b> <span>· ${plural(o.proveedores.length,"proveedor","proveedores")}</span>`;
  return `${esc(o.name)} <span>· sin proveedores</span>`;
}
function showTip(h,x,y){const t=$("#tip");t.innerHTML=tipText(h);t.style.left=x+"px";t.style.top=y+"px";t.classList.add("on");}
function hideTip(){$("#tip").classList.remove("on");}
let tipTimer;
function pick(x,y){
  const h=hit(x,y);
  if(!h) return;
  if(h.kind==="pais") go({level:1,pais:h.obj});
  else if(h.kind==="reg") go({level:2,pais:h.obj.pais,reg:h.obj});
  else if(h.kind==="mun") go({level:3,pais:S.pais,reg:S.reg,mun:h.obj});
  else{showTip(h,x,y);clearTimeout(tipTimer);tipTimer=setTimeout(hideTip,1600);}
}

/* ---------- navegación ---------- */
function go(sel,instant){
  Object.assign(S,{level:0,pais:null,reg:null,mun:null,prov:null},sel);
  hover=null;hideTip();
  if(!(sel.level===4&&!sel._move)) flyTo(target(),instant);
  render();
  const h=hashOf();
  if(location.hash.slice(1)!==h){try{history.replaceState(null,"",h?"#"+h:location.pathname+location.search);}catch(e){}}
  lastInteract=performance.now();
}
function up(){
  if(S.level===4) go({level:3,pais:S.pais,reg:S.reg,mun:S.mun});
  else if(S.level===3) go({level:2,pais:S.pais,reg:S.reg});
  else if(S.level===2) go({level:1,pais:S.pais});
  else go({level:0});
}
$("#back").onclick=up;
addEventListener("keydown",e=>{if(e.key==="Escape"&&document.activeElement.tagName!=="INPUT")up();});
function hashOf(){return [S.pais,S.reg,S.mun,S.prov].filter(Boolean).map(x=>x.slug).join("--");}
function fromHash(instant){
  const h=location.hash.slice(1);if(!h)return false;
  const [ps,rs,ms,vs]=h.split("--");
  const p=RED.paises.find(x=>x.slug===ps);if(!p)return false;
  const r=rs&&p.regiones.find(x=>x.slug===rs);
  const m=r&&ms&&r.municipios.find(x=>x.slug===ms);
  const v=m&&vs&&m.proveedores.find(x=>x.slug===vs);
  if(v) go({level:4,pais:p,reg:r,mun:m,prov:v,_move:true},instant);
  else if(m) go({level:3,pais:p,reg:r,mun:m},instant);
  else if(r) go({level:2,pais:p,reg:r},instant);
  else go({level:1,pais:p},instant);
  return true;
}
addEventListener("hashchange",()=>{if(location.hash.slice(1)!==hashOf())fromHash(false);});

/* ---------- panel ---------- */
const munName=m=>m.ok==="sin"?"Sin municipio":m.name;
function crumbs(){
  const c=[["Mundo",()=>go({level:0})]];
  if(S.pais)c.push([S.pais.nombre,()=>go({level:1,pais:S.pais})]);
  if(S.reg)c.push([S.reg.name,()=>go({level:2,pais:S.pais,reg:S.reg})]);
  if(S.mun)c.push([munName(S.mun),()=>go({level:3,pais:S.pais,reg:S.reg,mun:S.mun})]);
  if(S.prov)c.push([S.prov.nombre,()=>{}]);
  const nav=$("#crumbs");nav.innerHTML="";
  c.forEach(([t,f],i)=>{
    if(i){const s=document.createElement("span");s.className="sep";s.textContent="›";nav.appendChild(s);}
    const b=document.createElement("button");b.textContent=t;b.onclick=f;nav.appendChild(b);
  });
  nav.scrollLeft=nav.scrollWidth;
  $("#back").hidden=S.level===0;
}
const chev='<svg class="chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 3 5 5-5 5"/></svg>';
const initials=s=>s.replace(/^(el|la|los|las|finca|cafe|café)\s+/i,"").split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase();
function rowHTML(o){
  return `<button class="row" data-k="${o.k}" data-i="${o.i}">${o.lead||'<span class="dot"></span>'}<span class="tx"><div class="t">${esc(o.t)}</div>${o.s?`<div class="s">${esc(o.s)}</div>`:""}</span>${o.n!=null?`<span class="n">${esc(o.n)}</span>`:""}${chev}</button>`;
}
function render(){
  crumbs();
  const ph=$("#ph"),pb=$("#pb"),L=S.level;
  let head="",body="";
  if(L===0){
    const nReg=RED.paises.reduce((a,p)=>a+p.regiones.length,0);
    const nProv=IDX.proveedores.length,nProd=IDX.proveedores.reduce((a,v)=>a+v.productos.length,0);
    const nVar=new Set(IDX.proveedores.flatMap(v=>v.items.flatMap(i=>i.vars))).size;
    head=`<div class="kicker">Red de proveedores</div><h2>¿De dónde viene el café?</h2><div class="sub">Toca un país en el globo o búscalo abajo.</div>`;
    body=`<div class="stats">${[[RED.paises.length,"países"],[nReg,"regiones"],[nProv,"proveedores"],[nProd,"productos"],[nVar,"variedades"],[RED.paises.reduce((a,p)=>a+p.regiones.reduce((b,r)=>b+r.municipios.filter(m=>m.ok==="ok").length,0),0),"municipios"]].map(([v,l])=>`<div class="stat"><div class="v">${fmt(v)}</div><div class="l">${l}</div></div>`).join("")}</div>
      ${searchHTML()}<div id="results"></div>
      <div id="base"><div class="sec">Países</div>${RED.paises.map((p,i)=>rowHTML({k:"pais",i,t:p.nombre,s:`${plural(p.regiones.length,"región","regiones")} · ${plural(p.nProd,"producto","productos")}`,n:p.nProv})).join("")}
      ${avisosHTML()}</div>`;
  }else if(L===1){
    const p=S.pais,et=p.etiqueta.toLowerCase(),ets=et==="región"?"regiones":et+"s";
    head=`<div class="kicker">País</div><h2>${esc(p.nombre)}</h2><div class="sub">${plural(p.nProv,"proveedor","proveedores")} en ${plural(p.regiones.length,et,ets)}</div>`;
    body=`${searchHTML()}<div id="results"></div><div id="base"><div class="legend"><span><i style="background:var(--cherry)"></i>Con proveedores</span><span><i style="background:${C.depFill}"></i>Sin proveedores</span></div>
      <div class="sec">${esc(ets)}</div>${p.regiones.map((r,i)=>rowHTML({k:"reg",i,t:r.name,s:r.municipios.map(munName).join(", "),n:r.nProv})).join("")}</div>`;
  }else if(L===2){
    const r=S.reg;
    head=`<div class="kicker">${esc(S.pais.nombre)} · ${esc(S.pais.etiqueta)}</div><h2>${esc(r.name)}</h2><div class="sub">${plural(r.nProv,"proveedor","proveedores")} · ${plural(r.nProd,"producto","productos")}</div>`;
    const ms=r.municipios.slice().sort((a,b)=>(a.ok==="sin")-(b.ok==="sin")||b.proveedores.length-a.proveedores.length||a.name.localeCompare(b.name));
    r._ms=ms;
    body=`<div class="sec">Municipios</div>${ms.map((m,i)=>rowHTML({k:"mun",i,t:m.ok==="sin"?"Municipio sin especificar":m.name,s:m.proveedores.map(v=>v.nombre).join(", "),n:m.proveedores.length,lead:`<span class="dot${m.ok==="ok"?"":" off"}"></span>`})).join("")}`;
  }else if(L===3){
    const m=S.mun;
    head=`<div class="kicker">${esc(S.reg.name)} · Municipio</div><h2>${esc(m.ok==="sin"?"Sin municipio":m.name)}</h2><div class="sub">${plural(m.proveedores.length,"proveedor","proveedores")}</div>`;
    const note=m.ok==="sin"?`El Excel no dice el municipio de ${m.proveedores.length===1?"este proveedor":"estos proveedores"}; se ubican en el centro de ${esc(S.reg.name)}.`
      :m.ok==="conf"?`No encontré «${esc(m.name)}» en ${esc(S.reg.name)}. Lo ubiqué en el centro de la región hasta confirmarlo.`:"";
    body=(note?`<div class="note">${note}</div>`:"")+
      `<div class="sec">Proveedores</div>`+m.proveedores.map((v,i)=>rowHTML({k:"prov",i,t:v.nombre,s:[v.localidad?`Corregimiento: ${v.localidad}`:null,v.productos.length?plural(v.items.length,"producto","productos"):"Sin productos registrados"].filter(Boolean).join(" · "),n:v.id,lead:`<span class="avatar">${esc(initials(v.nombre))}</span>`})).join("");
  }else{
    const v=S.prov;
    const procs=[...new Set(v.items.flatMap(i=>i.procs))],vars=[...new Set(v.items.flatMap(i=>i.vars))];
    const lots=v.productos.length,uniq=v.items.length;
    head=`<div class="kicker">Proveedor · ${esc(v.id)}</div><h2>${esc(v.nombre)}</h2><div class="sub">${esc([v.localidad,v.mun.ok==="ok"?v.mun.name:null,S.reg.name,S.pais.nombre].filter(Boolean).join(", "))} · ${plural(uniq,"producto","productos")}${lots>uniq?` (${fmt(lots)} lotes)`:""}</div>`;
    const chips=(arr,t)=>arr.map(x=>`<button class="chip btn" data-t="${t}" data-x="${esc(x)}">${esc(x)}</button>`).join("");
    body=uniq?`${vars.length>1||procs.length>1?`<div class="sec">Filtrar</div><div class="chips" id="filt" style="padding:0 6px">${chips(vars,"v")}${chips(procs,"p")}</div>`:""}
      <div class="sec">Productos</div><div id="plist"></div>`:`<div class="empty">Este proveedor todavía no tiene productos en la hoja «Cropster Products».</div>`;
  }
  ph.innerHTML=head;pb.innerHTML=body;pb.scrollTop=0;
  pb.querySelectorAll(".row").forEach(b=>{
    b.addEventListener("click",()=>rowClick(b.dataset.k,+b.dataset.i));
    b.addEventListener("mouseenter",()=>rowHover(b.dataset.k,+b.dataset.i));
    b.addEventListener("mouseleave",()=>{hover=null;draw();});
  });
  if(L===4) renderProducts();
  const inp=$("#q");if(inp) inp.addEventListener("input",()=>search(inp.value));
  if(W<=760) $("#panel").classList.remove("max","min");
  draw();
}
function rowClick(k,i){
  if(k==="pais") go({level:1,pais:RED.paises[i]});
  else if(k==="reg") go({level:2,pais:S.pais,reg:S.pais.regiones[i]});
  else if(k==="mun") go({level:3,pais:S.pais,reg:S.reg,mun:S.reg._ms[i]});
  else if(k==="prov") go({level:4,pais:S.pais,reg:S.reg,mun:S.mun,prov:S.mun.proveedores[i]});
  else if(k==="hit"){const v=IDX.proveedores[i];go({level:4,pais:v.mun.reg.pais,reg:v.mun.reg,mun:v.mun,prov:v,_move:true});}
}
function rowHover(k,i){
  if(k==="reg") hover={kind:"reg",obj:S.pais.regiones[i]};
  else if(k==="mun") hover={kind:"mun",obj:S.reg._ms[i]};
  else if(k==="pais") hover={kind:"pais",obj:RED.paises[i]};
  else return;
  draw();
}
let filt=new Set();
function renderProducts(){
  filt=new Set();
  const f=$("#filt");
  if(f) f.querySelectorAll(".chip").forEach(c=>c.onclick=()=>{const key=c.dataset.t+"|"+c.dataset.x;filt.has(key)?filt.delete(key):filt.add(key);c.classList.toggle("on");listProducts();});
  listProducts();
}
function listProducts(){
  const v=S.prov,el=$("#plist");if(!el)return;
  const fv=[...filt].filter(x=>x[0]==="v").map(x=>x.slice(2)),fp=[...filt].filter(x=>x[0]==="p").map(x=>x.slice(2));
  const items=v.items.filter(it=>(!fv.length||fv.some(x=>it.vars.includes(x)))&&(!fp.length||fp.some(x=>it.procs.includes(x))));
  el.innerHTML=items.length?items.map(it=>`<div class="prod"><div class="t">${esc(it.title)}${it.n>1?` <span class="lots">×${it.n} lotes</span>`:""}</div>${it.title!==it.raw?`<div class="full">${esc(it.raw)}</div>`:""}${it.vars.length||it.procs.length?`<div class="chips">${it.vars.map(x=>`<span class="chip">${esc(x)}</span>`).join("")}${it.procs.map(x=>`<span class="chip p">${esc(x)}</span>`).join("")}</div>`:""}</div>`).join(""):`<div class="empty">Ningún producto con ese filtro.</div>`;
}
function searchHTML(){return `<div class="search"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7" cy="7" r="5"/><path d="m11 11 3.5 3.5" stroke-linecap="round"/></svg><input id="q" type="search" placeholder="Busca proveedor, región, variedad…" autocomplete="off"></div>`;}
function search(q){
  const res=$("#results"),base=$("#base");q=norm(q);
  if(q.length<2){res.innerHTML="";base.style.display="";return;}
  base.style.display="none";
  const hits=[];
  IDX.proveedores.forEach((v,i)=>{
    if(S.level===1&&v.mun.reg.pais!==S.pais)return;
    const where=[v.mun.ok==="ok"?v.mun.name:null,v.mun.reg.name,v.mun.reg.pais.nombre].filter(Boolean).join(", ");
    let why=null;
    if(norm(v.nombre).includes(q)||norm(v.id)===q) why=plural(v.items.length,"producto","productos");
    else if(norm(where).includes(q)||norm(v.localidad).includes(q)) why=where;
    else{
      const n=v.items.filter(it=>norm(it.raw).includes(q)||it.vars.some(x=>norm(x).includes(q))||it.procs.some(x=>norm(x).includes(q))).length;
      if(n) why=plural(n,"producto coincide","productos coinciden");
    }
    if(why) hits.push(rowHTML({k:"hit",i,t:v.nombre,s:`${where} · ${why}`,n:v.id,lead:`<span class="avatar">${esc(initials(v.nombre))}</span>`}));
  });
  res.innerHTML=hits.length?`<div class="sec">${plural(hits.length,"proveedor","proveedores")}</div>`+hits.join(""):`<div class="empty">Sin resultados para esa búsqueda.</div>`;
  res.querySelectorAll(".row").forEach(b=>b.addEventListener("click",()=>rowClick("hit",+b.dataset.i)));
}
function avisosHTML(){
  if(!RED.avisos||!RED.avisos.length) return "";
  return `<details class="avisos"><summary>▸ ${plural(RED.avisos.length,"dato por revisar","datos por revisar")} en el Excel</summary><ul>${RED.avisos.map(a=>`<li>${esc(a)}</li>`).join("")}</ul></details>`;
}
$("#ph").addEventListener("click",()=>{if(W>760)return;const p=$("#panel");
  if(p.classList.contains("max")){p.classList.remove("max");p.classList.add("min");}
  else if(p.classList.contains("min")){p.classList.remove("min");}
  else p.classList.add("max");
  setTimeout(()=>{resize();flyTo(target(),false);},260);
});
})();
