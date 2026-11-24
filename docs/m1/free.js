import * as T from './three.js';
import {OrbitControls} from './orbit.js';
import {addVenue} from './venue.js';

async function read(url,kind){
  const response=await fetch(url);
  if(!response.ok)throw Error('Kunde inte läsa '+url);
  return kind==='json'?response.json():response.arrayBuffer();
}
async function packed(name) {
  if(typeof DecompressionStream==='undefined')return read(name+'.bin');
  const res=await fetch(name+'.bin.gz');if(!res.ok)throw Error('Kunde inte läsa '+name);
  // Some hosts also apply a transport encoding. Accept either decoded or gzip bytes.
  const bytes=new Uint8Array(await res.arrayBuffer());
  if(bytes[0]!==31||bytes[1]!==139)return bytes.buffer;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
function sailNumber(n){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
  const c=canvas.getContext('2d');c.fillStyle='#fbfaf6';c.fillRect(0,0,256,512);
  c.fillStyle='#10212d';c.font='bold 94px sans-serif';c.textAlign='center';c.fillText(String(n),113,275);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}
export async function freeView(container, onLost){
  const [spec,raw,transforms,sailData,camData,markData,venue]=await Promise.all([
    read('scene.json','json'),packed('models'),packed('transforms'),packed('sails'),read('cameras.bin'),read('marks.bin'),read('stockholm.json','json')]);
  const pose=new Float32Array(transforms),cloth=new Int16Array(sailData),cameraTrack=new Float32Array(camData),markTrack=new Float32Array(markData);
  const canvas=document.createElement('canvas');
  const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  canvas.setAttribute('aria-label','Fri kamera. Dra för att vrida och nyp för att zooma.');
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();onLost();});
  container.append(canvas);
  const world=new T.Scene();world.fog=new T.FogExp2(0xc1d2da,.00069);
  world.add(new T.HemisphereLight(0xffffff,0x99b2b3,1.83));
  const sun=new T.DirectionalLight(0xfff4dd,2.05);sun.position.set(-150,230,90);world.add(sun);
  const clock=addVenue(world,venue),cam=new T.PerspectiveCamera(39,16/9,.22,5700);
  const controls=new OrbitControls(cam,canvas);controls.enablePan=false;controls.minDistance=10;controls.maxDistance=190;
  controls.minPolarAngle=.12;controls.maxPolarAngle=Math.PI*.477;controls.rotateSpeed=.72;controls.zoomSpeed=.85;
  const groups=spec.entries.map(()=>new T.Group());world.add(...groups);
  const rigid=new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  const sails=[];
  for(const g of spec.geometries){
    const geometry=new T.BufferGeometry();
    if(g.kind){
      geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(spec.vertices*3),3).setUsage(T.DynamicDrawUsage));
      geometry.setAttribute('uv',new T.Float32BufferAttribute(g.uv,2));geometry.setIndex(g.indices);
      const main=g.kind==='mainsail';
      const mat=new T.MeshLambertMaterial({color:main?0xffffff:g.boat<=2?0xcb3439:0x214ea6,map:main?sailNumber(g.boat):null,side:T.DoubleSide});
      const mesh=new T.Mesh(geometry,mat);mesh.frustumCulled=false;groups[g.id].add(mesh);sails.push(geometry);
    }else{
      const arr=(key,Type)=>new Type(raw,g[key][0],g[key][1]/Type.BYTES_PER_ELEMENT);
      geometry.setAttribute('position',new T.Float32BufferAttribute(Float32Array.from(arr('p',Int16Array),v=>v*.001),3));
      geometry.setAttribute('normal',new T.BufferAttribute(arr('n',Int8Array),3,true));
      geometry.setAttribute('color',new T.BufferAttribute(arr('c',Uint8Array),3,true));
      geometry.setIndex(new T.BufferAttribute(arr('ix',Uint32Array),1));groups[g.id].add(new T.Mesh(geometry,rigid));
    }
  }
  function label(name,color){
    const l=document.createElement('span');l.className='tag';l.textContent=name;l.style.setProperty('--team',color);container.append(l);return l;
  }
  const fleet=spec.boats.map(i=>groups[i]),labels=fleet.map((_,i)=>label((i<2?'USA ':'NZL ')+(i+1),i<2?'#eb575c':'#628de8'));
  const pins=[1,2].map((n)=>{
    const g=new T.Group(),mat=new T.MeshStandardMaterial({color:n===1?0xffca24:0xe25238});
    for(const [r,r2,h,y] of [[1.05,.89,.33,.25],[.86,.62,.48,.64],[.58,.29,.48,1.1]]){
      const m=new T.Mesh(new T.CylinderGeometry(r2,r,h,22),mat);m.position.y=y;g.add(m);
    }
    if(n===1){
      const ring=new T.Mesh(new T.RingGeometry(15.12,15.36,100),new T.MeshBasicMaterial({color:0xf0cd64,transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}));
      ring.rotation.x=-Math.PI/2;ring.position.y=.045;g.add(ring);
    }
    world.add(g);return g;
  });
  const markLabels=pins.map((_,i)=>label('M'+(i+1),'#d7b351'));
  const trails=fleet.map((_,i)=>{
    const geom=new T.BufferGeometry();geom.setAttribute('position',new T.BufferAttribute(new Float32Array(60*3),3));
    const line=new T.Line(geom,new T.LineBasicMaterial({color:i<2?0xe97777:0x7aa5fa,transparent:true,opacity:.65}));
    line.frustumCulled=false;world.add(line);return geom;
  });
  const p=new T.Vector3(),q=new T.Quaternion(),target=new T.Vector3(),prevTarget=new T.Vector3(),v=new T.Vector3();
  let w=0,h=0,focus='fleet',initialized=false,sample=-1;
  function fit(){
    const a=container.clientWidth,b=container.clientHeight;if(!a||!b||a===w&&b===h)return;
    w=a;h=b;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();
  }
  function timeline(t){
    const u=T.MathUtils.clamp(t/spec.step,0,spec.samples-1),a=Math.floor(u),b=Math.min(a+1,spec.samples-1),f=u-a;
    const count=groups.length;
    for(let j=0;j<count;j++){
      const g=groups[j],i=(a*count+j)*10,k=(b*count+j)*10;
      g.position.fromArray(pose,i).lerp(p.fromArray(pose,k),f);
      g.quaternion.fromArray(pose,i+3).slerp(q.fromArray(pose,k+3),f);
      g.scale.fromArray(pose,i+7).lerp(p.fromArray(pose,k+7),f);
    }
    const stride=spec.vertices*3;
    for(let j=0;j<sails.length;j++){
      const geom=sails[j],attr=geom.attributes.position,i=(a*sails.length+j)*stride,k=(b*sails.length+j)*stride;
      for(let n=0;n<stride;n++)attr.array[n]=(cloth[i+n]+(cloth[k+n]-cloth[i+n])*f)*.001;
      attr.needsUpdate=true;geom.computeVertexNormals();
    }
    pins.forEach((g,i)=>g.position.fromArray(markTrack,a*6+i*3).lerp(p.fromArray(markTrack,b*6+i*3),f));
    for(let j=0;j<trails.length;j++){
      const attr=trails[j].attributes.position;let valid=0;
      for(let n=0;n<59;n++){const row=a-(58-n)*3;if(row<0)continue;
        const idx=(row*count+spec.boats[j])*10;attr.setXYZ(valid++,pose[idx],.06,pose[idx+2]);}
      const boat=fleet[j].position;attr.setXYZ(valid++,boat.x,.06,boat.z);
      attr.needsUpdate=true;trails[j].setDrawRange(0,valid);
    }
    clock.value=t;sample=t;return a;
  }
  function aim(){
    if(focus==='mark')return target.copy(pins[0].position).setY(2);
    if(focus!=='fleet')return target.copy(fleet[Number(focus)].position).setY(3);
    target.set(0,0,0);for(const boat of fleet)target.add(boat.position);
    return target.multiplyScalar(.25).setY(4);
  }
  function update(t,reset=false){
    fit();if(!w)return;
    if(t!==sample)timeline(t);
    aim();
    if(reset||!initialized){
      const row=Math.min(spec.samples-1,Math.floor(t/spec.step))*6;
      const offset=v.fromArray(cameraTrack,row).sub(p.fromArray(cameraTrack,row+3));
      // Start on the programme side. Keep M1 and all competitors visible at takeover.
      const mid=p.copy(target).lerp(pins[0].position,.23);mid.y=4;
      const radius=Math.max(...[...fleet,pins[0]].map(g=>g.position.distanceTo(mid)));
      const distance=T.MathUtils.clamp(Math.max(offset.length(),radius*1.3/Math.tan(T.MathUtils.degToRad(cam.fov/2))/Math.min(1,cam.aspect)),30,175);
      cam.position.copy(mid).add(offset.normalize().multiplyScalar(distance));controls.target.copy(mid);initialized=true;
    }else{
      v.copy(target).sub(prevTarget);cam.position.add(v);controls.target.add(v);
    }
    prevTarget.copy(target);controls.update();renderer.render(world,cam);
    const placed=[];
    function place(el,pos,up){v.copy(pos);v.y+=up;v.project(cam);
      const visible=Math.abs(v.x)<.99&&Math.abs(v.y)<.96&&v.z<1&&v.z>-1;
      el.hidden=!visible;if(!visible)return;
      const x=(v.x+1)*w/2,anchorY=(1-v.y)*h/2;
      const lineHeight=w<600?16:20,boxWidth=w<600?38:49;
      let y=anchorY;
      while(placed.some(other=>Math.abs(x-other.x)<boxWidth && Math.abs(y-other.y)<lineHeight))y-=lineHeight;
      placed.push({x,y});el.style.left=x+'px';el.style.top=y+'px';
      el.style.setProperty('--stem',Math.max(0,anchorY-y)+'px');
    }
    fleet.forEach((g,i)=>place(labels[i],g.position,13));pins.forEach((g,i)=>place(markLabels[i],g.position,2.7));
  }
  return {update,enter(t){focus='fleet';initialized=false;update(t,true);},
    focus(value){focus=value;aim();v.copy(target).sub(controls.target);controls.target.copy(target);cam.position.add(v);prevTarget.copy(target);controls.update();},
    get camera(){return cam;},get time(){return sample;}};
}
