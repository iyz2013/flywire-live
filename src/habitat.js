import * as THREE from 'three';
/** An outdoor garden clearing. Decorative objects do not participate in locomotion physics. */
export class Habitat {
  constructor(scene) {
    this.owner=scene;
    scene.trail.visible=false;
    scene.key.shadow.radius=4;
    scene.key.intensity=2.9;
    const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#888652';ctx.fillRect(0,0,512,512);
    let seed=173;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<18000;i++){const grey=Math.floor(130+random()*100);ctx.fillStyle=`rgba(${grey},${grey},${grey},${.05+random()*.14})`;ctx.beginPath();ctx.arc(random()*512,random()*512,.2+random()*.8,0,Math.PI*2);ctx.fill();}
    for(let i=0;i<700;i++){
      ctx.fillStyle=['#66773b22','#ab9b6822','#42632822','#c2b88222'][i%4];
      ctx.beginPath();ctx.ellipse(random()*512,random()*512,4+random()*35,3+random()*18,random()*6,0,Math.PI*2);ctx.fill();
    }
    this.texture=new THREE.CanvasTexture(canvas);this.texture.wrapS=this.texture.wrapT=THREE.RepeatWrapping;this.texture.repeat.set(32,32);this.texture.colorSpace=THREE.SRGBColorSpace;
    scene.floor.material.map=this.texture;scene.floor.material.bumpScale=.003;scene.floor.material.roughness=.88;scene.floor.material.needsUpdate=true;
    this.group=new THREE.Group();scene.scene.add(this.group);
    this.stoneMaterial=new THREE.MeshStandardMaterial({color:'#8e9496',roughness:.92});
    const stoneGeometry=new THREE.IcosahedronGeometry(1,2);
    for(const [x,y,s] of [[-4,3.4,.7],[-4.8,3.8,.38],[-3.6,4.3,.32],[4.4,4,.8],[5.2,3.8,.35],[6,-1,.4],[-5,-2,.27]]){
      const stone=new THREE.Mesh(stoneGeometry,this.stoneMaterial);stone.position.set(x,y,s*.27);stone.scale.set(s,s*.7,s*.43);stone.rotation.z=random()*6;stone.castShadow=stone.receiveShadow=true;this.group.add(stone);
    }
    const leafMaterial=new THREE.MeshStandardMaterial({color:'#49932c',roughness:.68,side:THREE.DoubleSide});
    const leafShape=new THREE.Shape();leafShape.moveTo(0,0);leafShape.bezierCurveTo(-.6,.5,-.55,1.5,0,2.1);leafShape.bezierCurveTo(.55,1.5,.6,.5,0,0);
    const leafGeometry=new THREE.ShapeGeometry(leafShape,24);
    for(const [x,y,angle] of [[-3.5,3,-.7],[-3.5,3,.5],[-3.5,3,1.8],[4.7,4,-.9]]){
      const leaf=new THREE.Mesh(leafGeometry,leafMaterial);leaf.position.set(x,y,.18);leaf.rotation.set(.18,.1,angle);leaf.castShadow=true;this.group.add(leaf);
      const curve=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,.01),new THREE.Vector3(0,2.0,.01)]),new THREE.LineBasicMaterial({color:'#a3c44d',transparent:true,opacity:.65}));leaf.add(curve);
    }
    const drop=new THREE.Mesh(new THREE.SphereGeometry(.28,24,16),new THREE.MeshPhysicalMaterial({color:'#c6e1e5',roughness:.12,metalness:.12,transparent:true,opacity:.65,clearcoat:1}));drop.scale.z=.65;drop.position.set(-1.9,1.5,.12);this.group.add(drop);
    this.plantGarden();
  }
  animate(time){
    if(this.plants)for(let i=0;i<this.plants.length;i++){const plant=this.plants[i];plant.rotation.x=Math.sin(time*.9+i)*.055;plant.rotation.y=Math.cos(time*.7+i)*.04;}
  }
  plantGarden(){
    const scene=this.owner;
    scene.scene.fog=new THREE.FogExp2('#9daf77',.004);
    this.plants=[];
    let seed=812;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const grassGeometry=new THREE.BufferGeometry();
    grassGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.045,0,0,.045,0,0,.018,.09,.65,-.045,0,0,.018,.09,.65,-.025,.09,.65,-.025,.09,.65,.018,.09,.65,.09,.21,1.1],3));grassGeometry.computeVertexNormals();
    const grass=new THREE.InstancedMesh(grassGeometry,new THREE.MeshStandardMaterial({color:'#639236',roughness:.85,side:THREE.DoubleSide}),1600);
    const transform=new THREE.Object3D(),color=new THREE.Color();
    for(let i=0;i<1600;i++){
      const angle=random()*Math.PI*2,r=4+Math.pow(random(),.7)*22;
      transform.position.set(Math.cos(angle)*r,Math.sin(angle)*r,.01);transform.rotation.set(0,0,random()*6.28);const h=.4+random()*1.8;transform.scale.set(.8+random(),.8+random(),h);transform.updateMatrix();grass.setMatrixAt(i,transform.matrix);color.setHSL(.20+random()*.10,.42+random()*.22,.25+random()*.16);grass.setColorAt(i,color);
    }
    grass.receiveShadow=true;this.group.add(grass);
    const stemMat=new THREE.MeshStandardMaterial({color:'#497c29',roughness:.9});
    const pollenMat=new THREE.MeshStandardMaterial({color:'#eac24b',roughness:.8});
    const petals=['#f4c6de','#c0abec','#e9b253','#eff1cb','#82bce9'];
    const sphere=new THREE.SphereGeometry(1,12,8);
    for(let i=0;i<22;i++){
      const angle=i*2.4,r=5.5+random()*9;
      const flower=new THREE.Group();flower.position.set(Math.cos(angle)*r,Math.sin(angle)*r,0);
      const height=.8+random()*2.1;
      const stem=new THREE.Mesh(new THREE.CylinderGeometry(.028,.045,height,6),stemMat);stem.rotation.x=Math.PI/2;stem.position.z=height/2;flower.add(stem);
      const crown=new THREE.Group();crown.position.z=height;crown.rotation.set(.22*random(),.2*random(),random()*6);
      const petalMat=new THREE.MeshStandardMaterial({color:petals[i%petals.length],roughness:.68});
      for(let k=0;k<6;k++){const petal=new THREE.Mesh(sphere,petalMat);const a=k*Math.PI/3;petal.position.set(Math.cos(a)*.23,Math.sin(a)*.23,0);petal.scale.set(.27,.12,.065);petal.rotation.z=a;crown.add(petal);}
      const pollen=new THREE.Mesh(sphere,pollenMat);pollen.scale.set(.15,.15,.09);pollen.position.z=.045;crown.add(pollen);flower.add(crown);this.group.add(flower);this.plants.push(flower);
    }
    // A few warm fallen petals near the clearing add foreground color.
    for(let i=0;i<9;i++){const petal=new THREE.Mesh(sphere,new THREE.MeshStandardMaterial({color:petals[i%5],roughness:.86}));const a=i*2.4,r=3.7+random()*2;petal.position.set(Math.cos(a)*r,Math.sin(a)*r,.03);petal.scale.set(.24,.12,.035);petal.rotation.z=a;this.group.add(petal);}
  }
  setTheme(light){
    const scene=this.owner;
    scene.outputPass.uniforms.backdropEdge.value=light?[.53,.72,.83]:[.26,.40,.49];
    scene.outputPass.uniforms.backdropCenter.value=light?[.81,.87,.62]:[.59,.68,.39];
    scene.floor.material.color.set(light?'#e4d3a0':'#c6b98d');
    this.stoneMaterial.color.set(light?'#9b9e9d':'#686f73');
  }
}
