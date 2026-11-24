import * as T from './three.js';

export function addVenue(scene, map) {
  const ground = new T.MeshLambertMaterial({vertexColors:true,side:T.DoubleSide});
  ground.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 facadePos; varying vec3 facadeNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfacadePos=position;facadeNormal=normal;');
    shader.fragmentShader='varying vec3 facadePos; varying vec3 facadeNormal;\n'+shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if(abs(facadeNormal.y)<.2 && facadePos.y>2.6){
        float across=dot(facadePos.xz,vec2(-facadeNormal.z,facadeNormal.x));
        vec2 tile=vec2(across/3.8,(facadePos.y-2.4)/3.25);
        vec2 cell=abs(fract(tile)-.5);
        vec2 edge=max(fwidth(tile),vec2(.018));
        vec2 windowBand=1.-smoothstep(vec2(.15,.22)-edge,vec2(.15,.22)+edge,cell);
        float contrast=1.-smoothstep(.18,.85,max(edge.x,edge.y));
        diffuseColor.rgb*=1.-.38*windowBand.x*windowBand.y*contrast;
      }`);
  };
  const pos=[],cols=[],palette=['#ba9980','#d9b59c','#cab397','#bf9d86','#d3bd9f','#b68c75'].map(c=>new T.Color(c));
  const green=new T.Color('#849882'),roof=new T.Color('#68747a');
  function triangle(a,b,c,tint){pos.push(...a,...b,...c);for(let j=0;j<3;j++)cols.push(tint.r,tint.g,tint.b);}
  const vec=poly=>poly.map(([x,z])=>new T.Vector2(x,z));
  function cap(poly,h,color,holes=[]){
    const points=poly.concat(...holes);
    for(const [a,b,c] of T.ShapeUtils.triangulateShape(vec(poly),holes.map(vec))){
      const at=i=>[points[i][0],h,points[i][1]];
      triangle(at(c),at(b),at(a),color);
    }
  }
  cap([[-5000,-5000],[5000,-5000],[5000,5000],[-5000,5000]],1.2,green,[map.shore]);
  for(const [poly,height,k] of map.buildings){
    cap(poly,height+1,roof);
    for(let j=0;j<poly.length;j++){
      const [x,z]=poly[j],[u,v]=poly[(j+1)%poly.length];
      const a=[x,1,z],b=[u,1,v],c=[u,height+1,v],d=[x,height+1,z];
      triangle(a,b,c,palette[k]);triangle(a,c,d,palette[k]);
    }
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new T.Float32BufferAttribute(cols,3));geo.computeVertexNormals();
  scene.add(new T.Mesh(geo,ground));
  const water=new T.ShaderMaterial({uniforms:{clock:{value:0}},
    vertexShader:`varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader:`varying vec3 world;uniform float clock;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    void main(){
      vec2 p=world.xz;float t=clock*.48;
      vec2 q=vec2(dot(p,vec2(.85,.52)),dot(p,vec2(-.52,.85)));
      float drift=noise2(q*.085);
      float wave=noise2(vec2(q.x*.48+drift*2.,q.y*2.8+drift*5.-t));
      float cap=noise2(vec2(q.x*.9+.22*t,q.y*5.8+wave*2.1-t));
      float dist=length(world-cameraPosition),detail=1.-smoothstep(55.,340.,dist);
      float l=(wave-.5)*.32+(cap-.5)*.16;
      vec3 col=mix(vec3(.125,.24,.29),vec3(.33,.46,.51),.44+l*detail+(drift-.5)*.12);
      col+=vec3(.09,.11,.12)*smoothstep(.68,.92,.65*cap+.35*wave)*detail;
      col=mix(col,vec3(.65,.76,.8),smoothstep(250.,2100.,dist)*.82);
      gl_FragColor=vec4(col,1.);
    }`});
  const sea=new T.Mesh(new T.PlaneGeometry(13000,13000),water);
  sea.rotation.x=-Math.PI/2;sea.position.y=-.06;scene.add(sea);
  const sky=new T.Mesh(new T.SphereGeometry(3900,32,16),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,vertexShader:`varying float h;void main(){h=position.y/3900.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying float h;void main(){gl_FragColor=vec4(mix(vec3(.75,.83,.86),vec3(.31,.58,.79),smoothstep(-.02,.55,h)),1.);}`}));
  scene.add(sky);return water.uniforms.clock;
}
