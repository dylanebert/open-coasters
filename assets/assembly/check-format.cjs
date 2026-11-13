// One-time format spike, not a routine dependency. GLTF_VALIDATOR points to
// Khronos gltf-validator 2.0.0-dev.3.10 (package 2.0.0-dev.3.10).
const fs = require('fs'), path = require('path');
const validator = require(process.env.GLTF_VALIDATOR);
(async () => {
  const directory = path.resolve(__dirname, '../../demo/public/assets');
  for (const name of ['assembly-section','assembly-tie-bar','assembly-tie-fork','assembly-fitting']) {
    const file = name+'.gltf';
    const report = await validator.validateString(fs.readFileSync(path.join(directory,file),'utf8'), {
      uri:file, externalResourceFunction:uri => Promise.resolve(new Uint8Array(fs.readFileSync(path.join(directory,decodeURIComponent(uri)))))
    });
    console.log(file, validator.version(), JSON.stringify(report.issues));
    if (report.issues.numErrors) process.exitCode=1;
  }
})();
