import { expect, test } from 'bun:test';
import { exampleOptions, initialConfiguration, effective, selectExample, history, preview, commit, undo, redo } from './configuration';
import { geometryKey, changesSubject } from './selection';

test('ordinary chooser contains exactly five placement claims', () => {
  expect(exampleOptions.map(([key]) => key)).toEqual(['ties', 'station', 'supports', 'assembly', 'track']);
});

test('each example owns only its authoring values; rendering derives fixed reference inputs', () => {
  const state=structuredClone(initialConfiguration);
  const keys={ties:['path','spacing'],station:['spacing','start','end'],supports:['post1','post2'],assembly:['path','separation'],track:['path','secondSpine'],witness:['asset']};
  expect(Object.keys(state)).toEqual(['selected','values']);
  for(const [key,fields] of Object.entries(keys)) expect(Object.keys(state.values[key as keyof typeof state.values])).toEqual(fields);
  state.values.ties={path:'loop',spacing:1.25};
  state.values.station={spacing:1.5,start:2.125,end:7.875};
  state.values.supports={post1:1.234,post2:10.876};
  state.values.assembly={path:'curve',separation:1.6};
  state.values.track={path:'loop',secondSpine:true};
  expect(effective(selectExample(state,'ties')).assembly).toEqual({path:'loop',spacing:1.25,separation:1.2,tie:'assembly-tie-bar',witness:'normal'});
  expect(effective(selectExample(state,'station')).assembly).toEqual({path:'straight',spacing:1.5,separation:1.2,tie:'assembly-tie-bar',witness:'station',gapStart:2.125,gapEnd:7.875});
  expect(effective(selectExample(state,'supports')).assembly).toEqual({path:'straight',spacing:.65,separation:1.2,tie:'assembly-tie-bar',witness:'supports',post1:1.234,post2:10.876});
  expect(effective(selectExample(state,'assembly')).assembly).toEqual({path:'curve',spacing:.65,separation:1.6,tie:'assembly-tie-bar',witness:'normal'});
  expect(effective(selectExample(state,'track')).parameters).toMatchObject({configuration:'loop',fixed:true,secondSpine:true,spacing:.65,separation:1.2,width:.533333,depth:.533333});
  for(const [key] of exampleOptions) {
    const selected=selectExample(state,key);
    expect(selectExample(selectExample(selected,'witness'),key)).toEqual(selected);
  }
});

test('one history retains each example exactly once and inactive values cannot alter rendered inputs',()=>{
 const a=structuredClone(initialConfiguration), b={...a,values:{...a.values,ties:{...a.values.ties,spacing:1.25}}};
 const switched=selectExample(b,'assembly');
 const h=commit(preview(commit(preview(history(a),b)),switched));
 expect(undo(h).present).toEqual(b);expect(redo(undo(h)).present).toEqual(switched);
 expect(selectExample(switched,'ties')).toEqual(b);
 expect(changesSubject(effective(a),effective(b))).toBe(false);
 expect(changesSubject(effective(b),effective(switched))).toBe(true);
 expect(geometryKey(effective(a))).not.toBe(geometryKey(effective(b)));
 const inactive={...a,values:{...a.values,track:{path:'loop' as const,secondSpine:true}}};
 expect(effective(inactive)).toEqual(effective(a));
});
