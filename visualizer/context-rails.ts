export function ghostColor(theme: 'light' | 'dark'): [number, number, number, number] {
  return theme==='light' ? [.69,.70,.68,1] : [.065,.075,.07,1];
}
// Context only: two plain rectangular rails, no contributed profile or attachment semantics.
export function rails() {
  const vertices:number[]=[],indices:number[]=[];
  for(const x of [-.5,.5]) {
    const base=vertices.length/8;
    for(const [dx,y,z] of [[-.025,.04,-1.2],[.025,.04,-1.2],[.025,.09,-1.2],[-.025,.09,-1.2],[-.025,.04,.75],[.025,.04,.75],[.025,.09,.75],[-.025,.09,.75]]) vertices.push(x+dx!,y!,z!,0,1,0,0,0);
    for(const i of [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5]) indices.push(base+i);
  }
  return {vertices:new Float32Array(vertices),indices:new Uint32Array(indices)};
}
