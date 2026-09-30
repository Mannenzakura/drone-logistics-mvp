import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';

const PAD_POINTS = [[-11,15],[9,15],[-2,30],[18,30],[-21,29],[27,12]];
const OUTSIDE_POINTS = [[-42,27],[-49,34],[-34,35]];
const COLORS = {green:0x1b7055, gold:0xbd873a, blue:0x5c8fa7};

export function createAirport3D(host, onSelect) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe0edf1);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 350);
  camera.position.set(54, 70, 88);
  const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  host.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0,1,18);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 48;
  controls.maxDistance = 165;
  controls.maxPolarAngle = Math.PI/2.08;
  controls.update();
  let cameraGoal=null;
  controls.addEventListener('start',()=>{cameraGoal=null});
  const ambient=new THREE.HemisphereLight(0xffffff,0x9db8a7,1.25);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff,1.55);
  sun.position.set(-45,90,35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-90,right:90,top:90,bottom:-90,near:1,far:190});
  scene.add(sun);

  function mat(color, extra={}) {return new THREE.MeshStandardMaterial({color,roughness:.8,...extra})}
  function box(w,h,d,color,x,y,z,parent=scene) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color));
    mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function floor(w,d,color,x,z,y=.04,parent=scene) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w,d),mat(color,{side:THREE.DoubleSide}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  function label(text,x,y,z,w=15,fill='#ffffff',ink='#34594b',parent=scene) {
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle=fill;
    ctx.beginPath();ctx.roundRect(2,8,764,112,26);ctx.fill();
    ctx.strokeStyle='rgba(67,95,77,.2)';ctx.lineWidth=3;ctx.stroke();
    ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 46px Microsoft YaHei, sans-serif';ctx.fillText(text,384,66);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));
    sprite.position.set(x,y,z);sprite.scale.set(w,w/6,1);parent.add(sprite);return sprite;
  }
  function fenceLine(x1,z1,x2,z2) {
    const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz);
    const rail=box(.13,.2,len,0x819c8b,(x1+x2)/2,1.3,(z1+z2)/2);
    rail.rotation.y=Math.atan2(dx,dz);
    const rail2=box(.13,.2,len,0x819c8b,(x1+x2)/2,.6,(z1+z2)/2);
    rail2.rotation.y=rail.rotation.y;
    for(let s=0;s<=len;s+=6){const r=s/len;box(.3,1.9,.3,0x688a75,x1+dx*r,1,z1+dz*r)}
  }
  function pole(x,z){
    box(.28,7,.28,0x788f8d,x,3.5,z);
    box(1.9,.26,.6,0xe6e6d5,x,7.1,z);
    box(1.5,.06,.46,0xfff5c8,x,6.91,z);
  }
  function lowBuilding(x,z,w,d,name,color){
    box(w,5,d,color,x,2.55,z);
    box(w+.6,.65,d+.6,0x667f7c,x,5.45,z);
    for(let a=x-w/2+2;a<x+w/2-1;a+=3){box(2,2.2,.13,0x547d82,a,2.3,z+d/2+.09)}
    label(name,x,7,z,18);
  }
  floor(148,112,0xb6d0ad,0,0,0);
  floor(130,90,0xc8dcc0,0,4,.015);
  floor(105,14,0x3f5055,0,-18,.08);
  for(let x=-42;x<=42;x+=9)floor(4.2,.27,0xf6f4e8,x,-18,.14);
  for(const x of [-48,-46,-44,44,46,48])for(let z=-23;z<=-13;z+=2.2)floor(.38,1.1,0xf8f7eb,x,z,.15);
  for(const z of [-24.5,-11.5]){
    floor(104,.14,0xf2efe0,0,z,.15);
    for(let x=-48;x<=48;x+=8){
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.18,8,6),new THREE.MeshBasicMaterial({color:z<-18?0xf5d68c:0xc7f5ec}));
      lamp.position.set(x,.3,z);scene.add(lamp);
    }
  }
  for(const x of [-38,38]){
    label(x<0?'RWY 09':'RWY 27',x,1,-18,10,'#405359','#fff5dc');
  }
  label('跑道 · 示意',0,3,-24,19);
  // A marked taxi/service connector makes the apron circulation legible.
  floor(8,28,0x6e8582,-16,-1,.09);
  for(let z=-11;z<12;z+=5)floor(.24,2.2,0xf2ead2,-16,z,.17);
  floor(22,5,0x718a87,-5,11,.11);
  for(let x=-13;x<7;x+=5)floor(2.1,.2,0xf2ead2,x,11,.18);
  label('滑行联络道 · 示意',-22,3,6,19,'#f7faf2','#58746b').userData.zone={type:'taxiway'};
  const apron=floor(61,39,0xcbdad1,4,18,.1);
  apron.userData.zone={type:'apron'};
  for(let z=2;z<=36;z+=7)floor(60,.08,0xe8f0e7,4,z,.15);
  for(let x=-25;x<=32;x+=7)floor(.08,38,0xe8f0e7,x,18,.15);
  floor(58,.18,0xe1b852,4,7,.16);
  for(let x=-22;x<31;x+=8)floor(2.7,.18,0xe1b852,x,7,.17);
  floor(48,5,0xb2c8bb,7,36,.12);
  label('垂直起降坪 / 停机位',2,5,41,29);
  for(let x=-17;x<29;x+=9)floor(4,.19,0xf6f8f3,x,1,.15);
  for(const [x,z] of [[-24,0],[31,0],[-24,35],[30,35]])pole(x,z);

  // Dispatch and airfield support buildings, set apart from live resource slots.
  lowBuilding(-22,-30,18,7,'机务与调度',0xa6bcb5);
  lowBuilding(20,-30,14,7,'消防 / 保障',0xc9b9a9);
  for(const x of [-29,-25,-21,-17,-13])floor(1.5,2.5,0x91aba0,x,-37,.13);

  // Warehouse with loading-bay facade and pitched roof.
  const warehouse=box(27,9,17,0xb9cbca,34,4.6,29);
  warehouse.userData.zone={type:'warehouse'};
  const warehouseRoof=box(28,.9,18,0x769699,34,9.4,29);
  warehouseRoof.userData.zone={type:'warehouse'};
  for(const x of [23,28,33,38,43])box(2.7,.08,11,0xaec9c6,x,9.91,28);
  for(const x of [21,25,29,33,37,41,45])box(1.4,1.3,.08,0x3e6a72,x,6.5,37.55);
  for(let x of [23,31,39,47])box(4.5,4.1,.22,0x567f83,x,2.25,20.4);
  for(let x of [23,31,39,47])box(4.7,.5,.5,0xe4eded,x,4.75,20.1);
  for(let x of [23,31,39,47]){
    const door=box(4.8,3.3,.25,0x69857d,x,1.8,37.65);
    door.userData.zone={type:'truckDock'};
    floor(5,5,0xc2b79c,x,41,.14).userData.zone={type:'truckDock'};
  }
  label('货运库 / 分拣中心',34,14,29,25).userData.zone={type:'warehouse'};
  for(let i=0;i<7;i++)box(2,1.5,2,0xb78a54,15+i*4,1,39+i%2*2);
  label('货车装卸月台 · 点击查看',31,5.2,43,25,'#fff8ed','#846241').userData.zone={type:'truckDock'};
  const serviceRoad=floor(112,8,0x788e89,19,49,.09);serviceRoad.userData.zone={type:'truckGate'};
  for(let x=-26;x<75;x+=8)floor(3.5,.25,0xf8efd8,x,49,.17);
  label('货车专用入口 →',62,4.5,49,19,'#fff8ed','#846241').userData.zone={type:'truckGate'};
  box(3,3,3,0xb3c6b9,53,1.5,40);
  box(3.6,.35,3.6,0x607d74,53,3.2,40);
  box(.15,.18,8,0xf1eee3,56,2.4,45).userData.zone={type:'truckGate'};
  for(const x of [25,37,49])floor(6,2.6,0xa7b7a4,x,54,.11);
  for(const x of [18,27,36,45])pole(x,44);
  const truckGroup=new THREE.Group();scene.add(truckGroup);
  box(6,2.5,2.8,0xe3e9e0,0,2.1,0,truckGroup).userData.zone={type:'truckDock'};
  box(2.1,2.1,2.8,0x2c756b,3.8,1.9,0,truckGroup).userData.zone={type:'truckDock'};
  for(const x of [-2.1,2.8])for(const z of [-1.35,1.35]){
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.64,.64,.42,16),mat(0x303f3c));
    wheel.rotation.x=Math.PI/2;wheel.position.set(x,.72,z);wheel.userData.zone={type:'truckDock'};truckGroup.add(wheel);
  }
  label('货车 · 示意',0,4.8,0,12,'#fff8ed','#846241',truckGroup).userData.zone={type:'truckDock'};
  // Tower.
  box(5,16,5,0x8faeb4,45,8.1,-3);
  box(8,4,8,0x5b8d9b,45,18,-3);
  box(9,.7,9,0x466f7c,45,20.3,-3);
  label('塔台',47,25,-3,10);

  // Off-airport winch area and access road.
  const offsiteGround=floor(31,26,0xe3d2a2,-43,30,.13);
  offsiteGround.userData.zone={type:'outside',slot:0};
  floor(12,4,0xc5b48a,-30,43,.16);
  label('机场外索降区',-43,5,46,19,'#fff7e7','#8a662e');
  // Fence shows this area is outside the airport boundary.
  fenceLine(-28,-38,56,-38);fenceLine(56,-38,56,43);fenceLine(56,54,56,57);fenceLine(56,57,-28,57);fenceLine(-28,57,-28,-38);
  for(const x of [54.5,57.5])box(.45,4,.45,0x56796b,x,2,43);
  label('机场边界',-13,4,-38,13);
  for(const [x,z] of [[-61,-3],[-58,3],[-65,15],[-61,42],[64,-30],[67,-14],[68,17],[66,29]]){
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22,.32,2,7),mat(0x7a735b));trunk.position.set(x,1,z);scene.add(trunk);
    const crown=new THREE.Mesh(new THREE.ConeGeometry(1.6,4,7),mat(0x719473));crown.position.set(x,4,z);crown.castShadow=true;scene.add(crown);
  }

  // Airspace markers, translucent to keep ground scene legible.
  function airRing(x,z,color,text) {
    const ring=new THREE.Mesh(new THREE.TorusGeometry(8,.18,8,64),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7}));
    ring.rotation.x=Math.PI/2;ring.position.set(x,15,z);scene.add(ring);
    const disc=new THREE.Mesh(new THREE.CircleGeometry(8,48),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.08,side:THREE.DoubleSide,depthWrite:false}));
    disc.rotation.x=-Math.PI/2;disc.position.set(x,15,z);scene.add(disc);
    label(text,x,23,z,18,'#f1f8fb','#4e7890');
  }
  airRing(-46,-30,COLORS.blue,'进场等待空域');
  airRing(45,-30,COLORS.blue,'离场空域');

  const standGroup=new THREE.Group();scene.add(standGroup);
  function stand(x,z,mode,n) {
    const color=mode==='land'?0x2e876b:0xb7893d;
    floor(11,11,mode==='land'?0xe0ebe1:0xf3e2bc,x,z,.22,standGroup).userData.zone={type:mode==='land'?'pad':'outside',slot:n-1};
    for(const dx of [-5.2,5.2])for(const dz of [-5.2,5.2])floor(.8,.8,mode==='land'?0xe8b653:0xc59650,x+dx,z+dz,.27,standGroup);
    const base=new THREE.Mesh(new THREE.CylinderGeometry(4.8,5,0.45,48),mat(mode==='land'?0xe9f4eb:0xfff0ce));
    base.position.set(x,.48,z);base.castShadow=true;base.receiveShadow=true;
    base.userData.zone={type:mode==='land'?'pad':'outside',slot:n-1};standGroup.add(base);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(4.15,.2,8,64),new THREE.MeshBasicMaterial({color}));
    ring.rotation.x=Math.PI/2;ring.position.set(x,.75,z);standGroup.add(ring);
    for(const [dx,dz,w,d] of [[-1.3,0,.3,2.6],[1.3,0,.3,2.6],[0,0,2.8,.3]])floor(w,d,color,x+dx,z+dz,.74,standGroup);
    label((mode==='land'?'停机位 ':'索降位 ')+n,x,6.4,z,12,mode==='land'?'#edf8f0':'#fff5df',mode==='land'?'#2f7559':'#91692c',standGroup)
      .userData.zone={type:mode==='land'?'pad':'outside',slot:n-1};
  }
  function rebuildStands(p) {
    while(standGroup.children.length){const child=standGroup.children.pop();child.parent=null;child.geometry?.dispose();child.material?.dispose()}
    for(let i=0;i<Math.min(p.pads,PAD_POINTS.length);i++)stand(...PAD_POINTS[i],'land',i+1);
    for(let i=0;i<Math.min(p.outside_bays,OUTSIDE_POINTS.length);i++)stand(...OUTSIDE_POINTS[i],'outside',i+1);
  }

  const drones=new Map();
  function drone(id,mode) {
    const group=new THREE.Group();group.userData.flightId=id;scene.add(group);
    const color=mode==='land'?COLORS.green:COLORS.gold;
    box(1.15,.7,4.8,color,0,0,0,group);
    box(7.1,.18,1.25,0xe6e9e2,0,.1,-.25,group);
    box(3,.16,.75,0x435f5b,0,.2,2,group);
    box(.17,1.1,.85,0x435f5b,0,.75,1.8,group);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(.56,1.25,12),mat(color));
    nose.rotation.x=-Math.PI/2;nose.position.set(0,0,-2.85);group.add(nose);
    const rotors=[];
    for(let x of [-2.75,2.75])for(let z of [-.35,.35]){
      const hub=new THREE.Group();hub.position.set(x,.1,z);group.add(hub);
      const cap=new THREE.Mesh(new THREE.CylinderGeometry(.33,.33,.18,20),mat(0x415a57));hub.add(cap);
      box(1.35,.05,.12,0x283f42,0,.15,0,hub);
      rotors.push(hub);
    }
    const beacon=new THREE.Mesh(new THREE.SphereGeometry(.35,10,8),new THREE.MeshBasicMaterial({color:0xf7fbec}));beacon.position.y=.72;beacon.userData.flightId=id;group.add(beacon);
    const name=label(id,0,3.1,0,5.5,'#ffffff',mode==='land'?'#236a51':'#946826',group);
    name.userData.flightId=id;
    const rope=new THREE.Group();group.add(rope);
    const line=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,4,6),mat(0x846b46));line.position.y=-2;rope.add(line);
    const cargo=box(.9,.8,.9,0xc3934f,0,-4.4,0,rope);cargo.userData.flightId=id;
    rope.visible=mode==='outside';
    drones.set(id,{group,rotors,rope});return group;
  }
  function clearDrones(){for(const {group} of drones.values())scene.remove(group);drones.clear()}
  let flights=[],time=0,selected=null,night=null,standKey='',gameTheme=false;
  function setData(result,p) {
    flights=result.flights;night=result.night;
    const key=`${p.pads}/${p.outside_bays}`;
    if(key!==standKey){rebuildStands(p);standKey=key}
    const ids=new Set(flights.filter(f=>f.arrival<=result.minute+3&&(f.exit==null||f.exit>=result.minute-2)).map(f=>f.id));
    for(const [id,entry] of drones)if(!ids.has(id)){scene.remove(entry.group);drones.delete(id)}
    for(const f of flights)if(ids.has(f.id)&&!drones.has(f.id))drone(f.id,f.mode);
  }
  const lerp=(a,b,r)=>a+(b-a)*r;
  function smooth(a,b,r){const q=Math.max(0,Math.min(1,(r-a)/(b-a)));return q*q*(3-2*q)}
  function target(f){const pts=f.mode==='land'?PAD_POINTS:OUTSIDE_POINTS;return pts[(f.slot||0)%pts.length]}
  function setMinute(t,id) {time=t;selected=id;updatePositions();updateTruck();updateLighting()}
  function updateLighting(){
    const hour=time/60;
    const daylight=smooth(5,7,hour)*(1-smooth(17,19,hour));
    scene.background.copy(new THREE.Color(gameTheme?0x132b3a:0x142b42)).lerp(new THREE.Color(gameTheme?0x7499a6:0xe0edf1),daylight);
    ambient.intensity=(gameTheme?.5:.42)+daylight*(gameTheme?.58:.83);
    sun.intensity=.18+daylight*(gameTheme?1.07:1.37);
    sun.color.set(daylight>.4?0xffffff:0xa9c1e1);
    renderer.toneMappingExposure=(gameTheme?1.45:1.35)-.12*daylight;
  }
  function updateTruck(){
    const moving=night?.trips?.find(trip=>trip.depart<=time&&time<trip.arrive);
    if(moving){
      const progress=(time-moving.depart)/(moving.arrive-moving.depart);
      truckGroup.position.set(31+52*Math.min(1,progress*2),0,49);
      truckGroup.visible=progress<.7;
      return;
    }
    const active=flights.filter(f=>f.service_start!=null&&f.service_start<=time&&(f.service_end==null||time<f.service_end));
    truckGroup.position.set(active.length?31+30*(.5-.5*Math.cos(time*Math.PI/4)):62,0,49);
    truckGroup.visible=true;
  }
  function updatePositions() {
    const queue=flights.filter(f=>f.arrival<=time&&(f.enter==null||time<f.enter));
    for(const f of flights){
      const entry=drones.get(f.id);if(!entry)continue;
      const {group,rope}=entry;
      const visible=f.arrival<=time&&(f.exit==null||time<f.exit+1.1);
      group.visible=visible;if(!visible)continue;
      const q=queue.indexOf(f),hold=[-46+(Math.max(0,q)%3)*3.2,15+Math.floor(Math.max(0,q)/3)*1.7,-30+Math.sin(time*1.8+Math.max(0,q))*1.3];
      const [tx,tz]=target(f),ty=f.mode==='land'?1.7:7;
      let x=hold[0],y=hold[1],z=hold[2];
      if(f.enter!=null&&time<f.enter){
        const from=Math.max(f.arrival,f.enter-.9),r=smooth(from,f.enter,time);
        x=lerp(hold[0],tx,r);y=lerp(hold[1],ty,r)+Math.sin(Math.PI*r)*4;z=lerp(hold[2],tz,r);
      }else if(f.enter!=null){
        x=tx;y=ty;z=tz;
        if(f.exit!=null&&time>=f.exit){
          const r=smooth(f.exit,f.exit+1,time);
          x=lerp(tx,45,r);y=lerp(ty,16,r)+Math.sin(Math.PI*r)*5;z=lerp(tz,-30,r);
        }
      }
      group.position.set(x,y,z);
      group.rotation.y=f.exit!=null&&time>=f.exit?-.55:0;
      group.scale.setScalar(f.id===selected?1.28:1);
      rope.visible=f.mode==='outside'&&f.enter!=null&&time>=f.enter&&(f.exit==null||time<f.exit);
    }
  }
  function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false)}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let pressPoint=null;
  renderer.domElement.addEventListener('pointerdown',event=>{pressPoint=[event.clientX,event.clientY]});
  renderer.domElement.addEventListener('pointerup',event=>{
    if(pressPoint&&Math.hypot(event.clientX-pressPoint[0],event.clientY-pressPoint[1])>6)return;
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    ray.setFromCamera(pointer,camera);
    for(const hit of ray.intersectObjects(scene.children,true)){
      let object=hit.object;
      while(object){
        if(object.userData.flightId){onSelect({type:'flight',id:object.userData.flightId});return}
        if(object.userData.zone){onSelect(object.userData.zone);return}
        object=object.parent;
      }
    }
  });
  function focusZone(zone){
    let target,position;
    if(zone.type==='warehouse'){target=[34,5,29];position=[57,25,59]}
    else if(zone.type==='apron'){target=[4,1,18];position=[29,32,45]}
    else if(zone.type==='truckDock'||zone.type==='truckGate'){target=[36,2,43];position=[61,30,69]}
    else if(zone.type==='taxiway'){target=[-14,1,1];position=[17,35,31]}
    else {const [x,z]=(zone.type==='pad'?PAD_POINTS:OUTSIDE_POINTS)[zone.slot||0]||[0,0];target=[x,1,z];position=[x+17,24,z+20]}
    cameraGoal={target:new THREE.Vector3(...target),position:new THREE.Vector3(...position)};
  }
  function setCameraPreset(name){
    const presets={
      all:{position:[54,70,88],target:[0,1,18]},
      apron:{position:[30,36,52],target:[2,1,18]},
      cargo:{position:[57,30,61],target:[33,3,31]},
      tower:{position:[59,30,5],target:[18,1,5]}
    };
    const preset=presets[name]||presets.all;
    cameraGoal={position:new THREE.Vector3(...preset.position),target:new THREE.Vector3(...preset.target)};
  }
  function setGameTheme(on){
    gameTheme=on;updateLighting();
  }
  renderer.setAnimationLoop((now)=>{
    for(const {rotors,group} of drones.values())if(group.visible)for(const rotor of rotors)rotor.rotation.y=now*.012;
    if(cameraGoal){camera.position.lerp(cameraGoal.position,.09);controls.target.lerp(cameraGoal.target,.09);if(camera.position.distanceTo(cameraGoal.position)<.06)cameraGoal=null}
    controls.update();renderer.render(scene,camera);
  });
  return {setData,setMinute,resize,focusZone,setCameraPreset,setGameTheme,resetCamera(){setCameraPreset('all')}};
}
