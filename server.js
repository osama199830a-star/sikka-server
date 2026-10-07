const express=require('express'),http=require('http'),{WebSocketServer}=require('ws');
const app=express();app.use(express.static(__dirname+'/../app/www'));
app.get('/health',(q,r)=>r.send('ok'));
const srv=http.createServer(app),wss=new WebSocketServer({server:srv});
const drivers=new Map(),rides=new Map();let seq=1;
const send=(ws,o)=>ws&&ws.readyState===1&&ws.send(JSON.stringify(o));
const hav=(a,b)=>{const r=x=>x*Math.PI/180,p=r(b.lat-a.lat),q=r(b.lng-a.lng);
 const h=Math.sin(p/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(q/2)**2;return 12742*Math.asin(Math.sqrt(h))};
const free=()=>[...drivers.values()].filter(d=>d.online&&!d.ride&&d.pos);
function price(pick,drop){
 const near=free().filter(d=>hav(d.pos,pick)<2).length,s=near>=5?1:near>=3?1.3:near>=1?1.8:2.5;
 const km=hav(pick,drop)*1.3,min=km/30*60;
 return{km:+km.toFixed(1),min:Math.ceil(min),near,surge:s,fare:Math.round((10+4*km+.5*min)*s)};
}
function match(ride){
 const c=free().filter(d=>!ride.tried.has(d.id)&&hav(d.pos,ride.pick)<=5)
  .sort((a,b)=>hav(a.pos,ride.pick)-hav(b.pos,ride.pick));
 if(!c.length){send(ride.pws,{t:'none'});rides.delete(ride.id);return}
 const d=c[0];ride.tried.add(d.id);ride.offer=d.id;
 send(d.ws,{t:'offer',rid:ride.id,pick:ride.pick,drop:ride.drop,away:+hav(d.pos,ride.pick).toFixed(1),fare:ride.q.fare});
 send(ride.pws,{t:'status',s:'جارٍ عرض الطلب على سائق...'});
 clearTimeout(ride.timer);ride.timer=setTimeout(()=>{ride.offer=null;match(ride)},15000);
}
wss.on('connection',ws=>{
 ws.on('message',raw=>{
  let m;try{m=JSON.parse(raw)}catch{return}
  if(m.t==='hello'){ws.role=m.role;ws.id=m.id;if(m.role==='driver'){const d=drivers.get(m.id)||{id:m.id,online:false,ride:null};d.ws=ws;drivers.set(m.id,d)}return}
  if(ws.role==='passenger'){
   if(m.t==='quote')return send(ws,{t:'quote',...price(m.pick,m.drop)});
   if(m.t==='req'){const r={id:seq++,pick:m.pick,drop:m.drop,pws:ws,tried:new Set(),q:price(m.pick,m.drop)};rides.set(r.id,r);ws.rideId=r.id;match(r)}
   if(m.t==='cancel'){const r=rides.get(ws.rideId);if(r){clearTimeout(r.timer);const d=drivers.get(r.driver||r.offer);if(d){d.ride=null;send(d.ws,{t:'cancelled'})}rides.delete(r.id)}}
   return;
  }
  const d=drivers.get(ws.id);if(!d)return;
  if(m.t==='online')d.online=!!m.on;
  if(m.t==='loc'){d.pos=m.pos;const r=rides.get(d.ride);if(r)send(r.pws,{t:'drv',pos:m.pos})}
  const r=rides.get(m.rid);if(!r)return;
  if(m.t==='accept'&&r.offer===d.id){clearTimeout(r.timer);d.ride=r.id;r.driver=d.id;r.offer=null;
   send(r.pws,{t:'accepted',pos:d.pos,away:+hav(d.pos,r.pick).toFixed(1)})}
  if(m.t==='reject'&&r.offer===d.id){clearTimeout(r.timer);r.offer=null;match(r)}
  if(m.t==='pickup'&&r.driver===d.id)send(r.pws,{t:'status',s:'بدأت الرحلة'});
  if(m.t==='done'&&r.driver===d.id){send(r.pws,{t:'done',fare:r.q.fare});d.ride=null;rides.delete(r.id)}
 });
 ws.on('close',()=>{const d=drivers.get(ws.id);if(ws.role==='driver'&&d&&d.ws===ws){d.online=false;
  const r=rides.get(d.ride);if(r){send(r.pws,{t:'none'});rides.delete(r.id);d.ride=null}}});
});
srv.listen(process.env.PORT||3000,()=>console.log('Sikka server up'));
