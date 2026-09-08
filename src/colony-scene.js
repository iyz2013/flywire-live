import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** Low-detail, instanced specimens keep the fifty-fly habitat in one WebGL context. */
export class ColonyScene {
  constructor(canvas, labels, onSelect) {
    this.canvas=canvas; this.labels=labels; this.onSelect=onSelect; this.agents=[]; this.selected=''; this.follow=false;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled=true; this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#b9ced2');this.scene.fog=new THREE.Fog('#b9ced2',95,190);
    this.camera=new THREE.PerspectiveCamera(40,1,.1,250);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.minDistance=7;this.controls.maxDistance=115;this.controls.maxPolarAngle=Math.PI*.47;
    this.controls.addEventListener('start',()=>{this.follow=false;});
    this.scene.add(new THREE.HemisphereLight('#dff4ff','#66744f',2.7));
    const sun=new THREE.DirectionalLight('#fff0d6',3.2);sun.position.set(-25,45,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:100});sun.shadow.bias=-.0003;this.scene.add(sun);
    const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.85,...extra});
    const mesh=(geometry,mat,x,y,z)=>{const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.receiveShadow=true;this.scene.add(m);return m;};
    mesh(new THREE.PlaneGeometry(350,350),material('#8faaa8'),0,-2.1,0).rotation.x=-Math.PI/2;
    const island=mesh(new THREE.CylinderGeometry(35,37,2,96),material('#69766a'),0,-1,0);island.scale.z=.84;
    const earth=mesh(new THREE.CircleGeometry(35,96),material('#9da58a'),0,.01,0);earth.rotation.x=-Math.PI/2;earth.scale.y=.84;
    const clearing=mesh(new THREE.CircleGeometry(29.5,96),material('#c2b798'),0,.025,0);clearing.rotation.x=-Math.PI/2;clearing.scale.y=.84;
    // A shallow pond, a pale stone rim and planted borders stay fixed in world space.
    const rim=mesh(new THREE.CircleGeometry(6.6,64),material('#d5d0b9'),23,.045,-15);rim.rotation.x=-Math.PI/2;rim.scale.y=.58;
    const pond=mesh(new THREE.CircleGeometry(5.8,64),material('#58a7b5',{roughness:.23,metalness:.2}),23,.055,-15);pond.rotation.x=-Math.PI/2;pond.scale.y=.58;
    this.water=pond;
    const grass=new THREE.InstancedMesh(new THREE.ConeGeometry(.13,1.7,4),material('#5f785b'),700);
    const flower=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.32,1),material('#dedbb1'),180);
    const pebble=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),material('#b6b9aa'),90);
    const dummy=new THREE.Object3D();let seed=81;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
    for(let i=0;i<700;i++){const a=rand()*Math.PI*2,r=30+rand()*4;dummy.position.set(Math.cos(a)*r,.55,Math.sin(a)*r*.84);dummy.rotation.set(rand()*.2,rand()*6,rand()*.3);dummy.scale.setScalar(.5+rand()*.7);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);grass.setColorAt(i,new THREE.Color().setHSL(.22+rand()*.12,.22,.28+rand()*.13));if(i<180){dummy.position.y=1.1;dummy.scale.setScalar(.6+rand());dummy.updateMatrix();flower.setMatrixAt(i,dummy.matrix);flower.setColorAt(i,new THREE.Color(['#b1a1e8','#e7bf96','#f2e9cb'][i%3]));}}
    for(let i=0;i<90;i++){const a=rand()*6.28,r=29+rand()*6;dummy.position.set(Math.cos(a)*r,.1,Math.sin(a)*r*.84);dummy.scale.set(.25+rand()*.6,.16+rand()*.24,.3+rand()*.5);dummy.rotation.set(rand(),rand()*6,rand());dummy.updateMatrix();pebble.setMatrixAt(i,dummy.matrix);}
    this.scene.add(grass,flower,pebble);grass.castShadow=true;flower.castShadow=true;pebble.castShadow=true;
    this.parts=[];
    const part=(geometry,color,position,scale,kind='',side=0)=>{const m=new THREE.InstancedMesh(geometry,material(color,kind==='wing'?{transparent:true,opacity:.55,roughness:.28,side:THREE.DoubleSide}:{}),50);m.count=0;m.castShadow=kind!=='wing';m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;this.scene.add(m);this.parts.push({mesh:m,position,scale,kind,side});};
    const sphere=new THREE.SphereGeometry(1,12,8);
    part(sphere,'#aa793a',[0,.63,-.37],[.38,.36,.68]);
    part(sphere,'#cda95f',[0,.78,.25],[.4,.4,.45]);
    part(sphere,'#c9a45d',[0,.79,.73],[.36,.3,.29]);
    for(const s of [-1,1]){
      part(sphere,'#ad302d',[s*.28,.85,.85],[.17,.2,.15]);
      part(sphere,'#e3f1e9',[s*.52,.94,-.2],[.36,.035,.85],'wing',s);
      for(let k=0;k<3;k++)part(new THREE.CylinderGeometry(.035,.018,1,5),'#665337',[s*.55,.31,.5-k*.43],[1,.78,1],'leg',s*(k+1));
      part(new THREE.CylinderGeometry(.024,.013,.4,5),'#5a4b38',[s*.17,.92,1.04],[1,1,1],'antenna',s);
    }
    this.halos=new THREE.InstancedMesh(new THREE.RingGeometry(.9,1.01,32),new THREE.MeshBasicMaterial({color:'#a9d9ff',side:THREE.DoubleSide,transparent:true,opacity:.65}),50);this.halos.count=0;this.halos.frustumCulled=false;this.scene.add(this.halos);
    this.dummy=new THREE.Object3D();this.root=new THREE.Object3D();this.local=new THREE.Object3D();this.matrix=new THREE.Matrix4();this.projected=new THREE.Vector3();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.overview();this.resize();
  }
  setAgents(agents){this.agents=agents;for(const p of this.parts)p.mesh.count=agents.length;this.halos.count=agents.length;this.labels.replaceChildren();agents.forEach((a,i)=>{a.home=new THREE.Vector3(((i%8)-3.5)*6.3,0,(Math.floor(i/8)-3)*6.4);const b=document.createElement('button');b.className='fly-label';b.textContent=String(i+1);b.title=a.token.symbol+' — '+a.token.name;b.setAttribute('aria-label','Select '+a.token.name);b.onclick=()=>this.onSelect(a.token.address);this.labels.append(b);a.label=b;});}
  overview(){this.follow=false;this.controls.target.set(0,0,0);this.camera.position.set(32,58,54);this.controls.update();}
  focus(){this.follow=true;const a=this.agents.find(a=>a.token.address===this.selected);if(a){const p=a.motion.pose;this.controls.target.set(a.home.x+p.x*.28,p.y*.5+.6,a.home.z+p.z*.28);this.camera.position.copy(this.controls.target).add(new THREE.Vector3(6,6,10));this.controls.update();}}
  setTheme(light){this.scene.background.set(light?'#cbdde0':'#8da8b0');this.scene.fog.color.copy(this.scene.background);}
  resize(){const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();}
  render(dt,now){
    const {root,local,matrix,dummy}=this;
    for(let i=0;i<this.agents.length;i++){
      const a=this.agents[i],p=a.motion.advance(dt);root.position.set(a.home.x+p.x*.28,p.y*.65,a.home.z+p.z*.28);root.rotation.set(p.pitch,p.yaw,p.bank);root.updateMatrix();if(!a.world)a.world=new THREE.Vector3();a.world.copy(root.position);
      for(const part of this.parts){local.position.fromArray(part.position);local.scale.fromArray(part.scale);local.rotation.set(0,0,0);if(part.kind==='wing'){local.rotation.z=part.side*(.12+Math.sin(now*.06+i)*.8*p.flightBlend);local.rotation.y=part.side*.23;}
        if(part.kind==='leg'){local.rotation.z=Math.sign(part.side)*.8;local.rotation.x=Math.sin(p.phase+(Math.abs(part.side)%2)*Math.PI)*.35*Math.min(1,Math.abs(p.velocity))+(p.groom&&Math.abs(part.side)===1?Math.sin(now*.008+i)*.5*p.groom:0);}
        if(part.kind==='antenna')local.rotation.x=.8;
        local.updateMatrix();matrix.multiplyMatrices(root.matrix,local.matrix);part.mesh.setMatrixAt(i,matrix);
      }
      const active=Date.now()-a.lastPulse<5000;dummy.position.set(root.position.x,.06,root.position.z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(a.token.address===this.selected?1.25:active?1:.001);dummy.updateMatrix();this.halos.setMatrixAt(i,dummy.matrix);this.halos.setColorAt(i,new THREE.Color(active?(a.last?.side==='sell'?'#ff656f':'#32e982'):'#c8e9ff'));
      if(this.follow&&a.token.address===this.selected){const target=root.position.clone().add(new THREE.Vector3(0,.7,0)),delta=target.sub(this.controls.target);this.controls.target.addScaledVector(delta,.1);this.camera.position.addScaledVector(delta,.1);}
    }
    for(const p of this.parts)p.mesh.instanceMatrix.needsUpdate=true;this.halos.instanceMatrix.needsUpdate=true;if(this.halos.instanceColor)this.halos.instanceColor.needsUpdate=true;
    this.controls.update();this.renderer.render(this.scene,this.camera);
    for(const a of this.agents){this.projected.copy(a.world).add(new THREE.Vector3(0,1.8,0)).project(this.camera);a.label.hidden=Math.abs(this.projected.x)>1||Math.abs(this.projected.y)>1||Math.abs(this.projected.z)>1;a.label.style.transform=`translate(${(this.projected.x*.5+.5)*this.canvas.clientWidth-11}px,${(-this.projected.y*.5+.5)*this.canvas.clientHeight-9}px)`;}
  }
  dispose(){this.resizeObserver.disconnect();this.controls.dispose();this.scene.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});this.renderer.dispose();}
}
