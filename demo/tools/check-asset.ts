import { resolve, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { loadGltf } from "@dylanebert/shallot/gltf";
import { staticInstanceSnapshot } from "../src/instance";
import { loadProfile } from "../src/profile";

try {
    const [kind, path, ...extra] = process.argv.slice(2);
    if (!path || extra.length || (kind !== "instance" && kind !== "profile"))
        throw new Error("Usage: bun demo/tools/check-asset.ts <instance|profile> <local.gltf>");
    if (extname(path).toLowerCase() !== ".gltf") throw new Error("Expected a local JSON .gltf file");
    const url = pathToFileURL(resolve(path));
    if (kind === "profile") await loadProfile(url);
    else {
        const scene = await loadGltf(await staticInstanceSnapshot(url));
        if (scene.unsupported.length) throw new Error(scene.unsupported.join(", "));
    }
    console.log(`PASS: ${kind} subset and public decoder: ${url.pathname}`);
    console.log("Not full glTF validation or source-fidelity validation; run Khronos validation and independent source/adoption checks separately.");
} catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
}
