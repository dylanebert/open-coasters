import { nativeSnapshot } from '../../construction/native';
import type { Material } from '../../construction/sweep';

const appearanceSnapshot = nativeSnapshot({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},material:0}]}],materials:[{pbrMetallicRoughness:{baseColorFactor:[.06,.7,.78,1],metallicFactor:.7,roughnessFactor:.25}}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'}],bufferViews:[{buffer:0,byteLength:36}],buffers:[{byteLength:36}]},[new Float32Array([0,0,0,1,0,0,0,1,0]).buffer]);
export const railAppearance: Material = {snapshot:appearanceSnapshot,material:0};
