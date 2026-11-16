import { expect, test } from "bun:test";
import { mkdtemp, mkdir, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const command = fileURLToPath(new URL("../tools/check-asset.ts", import.meta.url));
const assets = new URL("../public/assets/", import.meta.url);

test("actual local command: external bytes, unrelated cwd, refusals and bounded claims", async () => {
    const dir = await mkdtemp(join(tmpdir(), "asset-check-"));
    const run = async (...args: string[]) => {
        const child = Bun.spawn([process.execPath, command, ...args], { cwd: tmpdir(), stdout: "pipe", stderr: "pipe" });
        const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
        return { out, err, code };
    };
    try {
        await mkdir(join(dir, "bytes"));
        for (const [kind, name] of [["instance", "blitz-tie"], ["profile", "ModernRail"]] as const) {
            const json = await Bun.file(new URL(`${name}.gltf`, assets)).json();
            // Copy every dependent buffer into a nested location, not the subprocess cwd.
            for (const [i, buffer] of json.buffers.entries()) {
                await copyFile(fileURLToPath(new URL(buffer.uri, assets)), join(dir, "bytes", `${i}.bin`));
                buffer.uri = `bytes/${i}.bin`;
            }
            const path = join(dir, `${name}.gltf`);
            await Bun.write(path, JSON.stringify(json));
            const pass = await run(kind, path);
            expect(pass.code).toBe(0);
            expect(pass.out).toContain(`PASS: ${kind} subset and public decoder`);
            expect(pass.out).toContain("Not full glTF validation or source-fidelity validation");
            json.animations = [{ channels: [], samplers: [] }];
            await Bun.write(path, JSON.stringify(json));
            const unsupported = await run(kind, path);
            expect(unsupported.code).toBe(1);
            expect(unsupported.err).toContain("unsupported");
            delete json.animations;
            json.buffers[0].uri = "missing.bin";
            await Bun.write(path, JSON.stringify(json));
            const missing = await run(kind, path);
            expect(missing.code).toBe(1);
            expect(missing.out).not.toContain("PASS");
        }
        const nonprofile = await run("profile", fileURLToPath(new URL("blitz-tie.gltf", assets)));
        expect(nonprofile.code).toBe(1);
        expect(nonprofile.err).toContain("Profile:");
        for (const args of [[], ["other", "x.gltf"], ["instance"], ["instance", "x.gltf", "extra"], ["instance", join(dir, "absent.gltf")], ["instance", "x.glb"]]) {
            const result = await run(...args);
            expect(result.code).toBe(1);
            expect(result.err).toContain("FAIL:");
            expect(result.out).not.toContain("PASS");
        }
    } finally { await rm(dir, { recursive: true, force: true }); }
}, 15000);
