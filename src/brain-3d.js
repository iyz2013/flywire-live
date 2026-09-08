import * as THREE from 'three';
import { writeStimulusTags } from './event-colors.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { requestBytes } from './data-loader.js';

/** 3D view of the exact MaleCNS rows used by the upstream neural worker.
 * Coordinates and sampled edges are measured data; no invented morphologies. */
export class Brain3D {
  constructor(canvas) {
    this.canvas = canvas; this.neurons = []; this.selection = new Set(); this.selectionDirty = false;
    this.projection = 'brain'; this.tick = 0; this.pulseAt = -10000;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.scene = new THREE.Scene(); this.group = new THREE.Group(); this.scene.add(this.group);
    this.camera = new THREE.PerspectiveCamera(38, 1, .01, 2000);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true; this.controls.enablePan = false;
    this.controls.minDistance = 30; this.controls.maxDistance = 400;
    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { base: { value: new THREE.Color('#95a7ba') }, accent: { value: new THREE.Color('#a8d7ff') }, decay: { value: 0 }, selectedDecay: { value: 0 }, ratio: { value: this.renderer.getPixelRatio() }, baseAlpha: { value: .16 }, now: { value: 0 }, lightMode: { value: 0 } },
      vertexShader: `attribute vec3 spatialColor; varying vec3 vSpatial; attribute float activity; attribute float selected; attribute float visiblePoint; attribute vec3 eventColor; attribute float eventTime; uniform float now; varying vec3 vEventColor; varying float vEvent;
        uniform float decay; uniform float selectedDecay; uniform float ratio;
        varying float vIntensity; varying float vVisible;
        void main(){ vSpatial=spatialColor; vVisible=visiblePoint; vEvent=clamp(1.-(now-eventTime)/5.,0.,1.); vEventColor=eventColor; vIntensity=max(activity*decay,vEvent);
          vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
          gl_PointSize=clamp((1.3+vIntensity*4.4)*ratio*145./max(40.,-mv.z),.65,8.*ratio); }`,
      fragmentShader: `uniform vec3 base; uniform vec3 accent; uniform float baseAlpha; uniform float lightMode; varying vec3 vSpatial; varying vec3 vEventColor; varying float vEvent;
        varying float vIntensity; varying float vVisible;
        void main(){float r=length(gl_PointCoord-.5);if(r>.5||vVisible<.5)discard;
          float alpha=mix(baseAlpha,.95,min(1.,vIntensity));
          vec3 anatomy=mix(vSpatial,vSpatial*.47,lightMode); vec3 color=mix(mix(anatomy,vec3(.95,.98,1.),min(.65,vIntensity*.65)),vEventColor,step(.01,vEvent)); gl_FragColor=vec4(color,alpha*smoothstep(.5,.15,r));}`,
    });
    this.points = new THREE.Points(this.geometry, this.material); this.points.frustumCulled = false; this.group.add(this.points);
    this.highlightMaterial=this.material.clone();
    this.highlightMaterial.uniforms=this.material.uniforms;
    this.highlightMaterial.depthTest=false;
    this.highlightMaterial.fragmentShader=`varying vec3 vEventColor; varying float vEvent; varying float vVisible;
      void main(){float r=length(gl_PointCoord-.5);if(vEvent<.01||vVisible<.5||r>.5)discard;
        gl_FragColor=vec4(vEventColor,smoothstep(.5,.1,r)*min(1.,vEvent*2.));}`;
    this.highlights=new THREE.Points(this.geometry,this.highlightMaterial);this.highlights.frustumCulled=false;this.highlights.renderOrder=3;this.group.add(this.highlights);
    this.edgeGeometry = new THREE.BufferGeometry();
    this.edges = new THREE.LineSegments(this.edgeGeometry, new THREE.LineBasicMaterial({ vertexColors:true, transparent: true, opacity: .033, depthWrite: false }));
    this.edges.frustumCulled = false; this.group.add(this.edges); this.showEdges = true;
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
    this.frame = requestAnimationFrame(now => this.animate(now));
  }
  async load() {
    const bytes = await requestBytes('./data/neurons.json.gz'), magic = new Uint8Array(bytes);
    const json = magic[0] === 31 && magic[1] === 139 ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(bytes);
    this.neurons = JSON.parse(json); const n = this.neurons.length;
    this.position = new Float32Array(n*3); this.visible = new Float32Array(n); this.activity = new Float32Array(n); this.selected = new Float32Array(n);
    for (let i=0;i<n;i++) { const p=this.neurons[i][6]; if(p) this.position.set([-p[0]/1000,-p[2]/1000,p[1]/1000],i*3); }
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.position,3));
    this.geometry.setAttribute('visiblePoint',new THREE.BufferAttribute(this.visible,1));
    this.geometry.setAttribute('activity',new THREE.BufferAttribute(this.activity,1));
    this.geometry.setAttribute('selected',new THREE.BufferAttribute(this.selected,1));
    this.eventColors=new Float32Array(n*3);this.eventTimes=new Float32Array(n).fill(-10000);
    this.geometry.setAttribute('eventColor',new THREE.BufferAttribute(this.eventColors,3));
    this.geometry.setAttribute('eventTime',new THREE.BufferAttribute(this.eventTimes,1));
    this.spatialColors=new Float32Array(n*3);
    // A decorative spatial spectrum, not a biological cell-type classification.
    const colors=[[.52,.33,1.],[.19,.66,1.],[.25,.92,.96],[1.,.69,.26]];
    const xValues=this.neurons.filter(r=>r[6]).map(r=>-r[6][0]/1000).sort((a,b)=>a-b);
    const lo=xValues[Math.floor(xValues.length*.02)],hi=xValues[Math.floor(xValues.length*.98)];
    for(let i=0;i<n;i++){
      const t=Math.max(0,Math.min(2.999,(this.position[i*3]-lo)/(hi-lo)*3)),a=Math.floor(t),f=t-a;
      const depth=.78+.22*Math.sin(this.position[i*3+2]*.09);
      for(let k=0;k<3;k++)this.spatialColors[i*3+k]=(colors[a][k]*(1-f)+colors[a+1][k]*f)*depth;
    }
    this.geometry.setAttribute('spatialColor',new THREE.BufferAttribute(this.spatialColors,3));
    this.layout(); return this.neurons;
  }
  layout() {
    if (!this.neurons.length) return;
    const box = new THREE.Box3(), point = new THREE.Vector3();
    this.neurons.forEach((row,i) => { const p=row[6]; this.visible[i]=p && p[2]>=9000 && p[2] <= (this.projection==='brain'?58000:136000) ? 1:0; if(this.visible[i]) box.expandByPoint(point.fromArray(this.position,i*3)); });
    this.geometry.attributes.visiblePoint.needsUpdate=true;
    this.center=box.getCenter(new THREE.Vector3()); this.span=box.getSize(new THREE.Vector3());
    this.group.position.copy(this.center).negate(); this.rebuildEdges(); this.resetCamera();
  }
  resetCamera() {
    this.controls.target.set(0,0,0);
    const size=this.span || new THREE.Vector3(90,50,50);
    const fit=Math.max(size.y,size.x/Math.max(.6,this.camera.aspect),size.z*.5)/Math.tan(19*Math.PI/180)*.66;
    this.camera.position.set(fit*.18,fit*.12,fit); this.controls.update();
  }
  resize() {
    const rect=this.canvas.getBoundingClientRect(); if(!rect.width||!rect.height)return;
    this.renderer.setSize(rect.width,rect.height,false); this.camera.aspect=rect.width/rect.height; this.camera.updateProjectionMatrix();
  }
  setConnections(pairs) { this.pairs=pairs; this.rebuildEdges(); }
  rebuildEdges() {
    if(!this.pairs||!this.position)return; const vertices=[],colors=[];
    for(let k=0;k<this.pairs.length;k+=2){const a=this.pairs[k],b=this.pairs[k+1];if(!this.visible[a]||!this.visible[b])continue;vertices.push(...this.position.subarray(a*3,a*3+3),...this.position.subarray(b*3,b*3+3));colors.push(...this.spatialColors.subarray(a*3,a*3+3),...this.spatialColors.subarray(b*3,b*3+3));}
    this.edgeGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));this.edgeGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  }
  stimulate(cells,side){
    if(!this.eventTimes)return;writeStimulusTags(this.eventColors,this.eventTimes,cells,side,performance.now()/1000);
    this.geometry.attributes.eventColor.needsUpdate=true;this.geometry.attributes.eventTime.needsUpdate=true;
  }
  result(indices,counts,tick) {
    if(!this.activity)return;this.activity.fill(0);for(let i=0;i<indices.length;i++)this.activity[indices[i]]=Math.min(1,.35+counts[i]/8);
    this.geometry.attributes.activity.needsUpdate=true;this.lastResult=performance.now();this.tick=tick;
  }
  clearActivity(){if(this.activity){this.activity.fill(0);this.geometry.attributes.activity.needsUpdate=true;}}
  clear(){this.selection.clear();this.selectionDirty=true;}
  reset(){this.clear();this.clearActivity();if(this.eventTimes){this.eventTimes.fill(-10000);this.geometry.attributes.eventTime.needsUpdate=true;}}
  setTheme(light){this.material.uniforms.lightMode.value=light?1:0;this.material.uniforms.baseAlpha.value=light?.25:.20;this.edges.material.opacity=light?.08:.033;}
  animate(now){
    this.frame=requestAnimationFrame(t=>this.animate(t));if(document.hidden)return;
    if(this.selectionDirty&&this.selected){this.selected.fill(0);for(const i of this.selection)this.selected[i]=1;this.geometry.attributes.selected.needsUpdate=true;this.selectionDirty=false;}
    this.material.uniforms.now.value=now/1000;
    this.material.uniforms.decay.value=Math.max(0,1-(now-(this.lastResult||0))/1000);
    this.material.uniforms.selectedDecay.value=Math.max(0,1-(now-this.pulseAt)/900);
    this.edges.visible=this.showEdges;this.controls.update();this.renderer.render(this.scene,this.camera);
  }
  dispose(){cancelAnimationFrame(this.frame);this.observer.disconnect();this.controls.dispose();this.geometry.dispose();this.material.dispose();this.highlightMaterial.dispose();this.edgeGeometry.dispose();this.edges.material.dispose();this.renderer.dispose();}
}
