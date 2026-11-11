import { createApp, runApp } from "@dylanebert/shallot";
import { attachCanvas } from "@dylanebert/shallot/rendering";
import { Scene, scene } from "./scene";
import "./style.css";

try {
    const stepped = new URLSearchParams(location.search).has("stepped");
    const app = await (stepped ? createApp : runApp)({
        plugins: [
            scene,
            {
                name: "CanvasHost",
                dependencies: [scene],
                initialize(world) {
                    attachCanvas(
                        world,
                        world.resource(Scene).camera,
                        document.querySelector("canvas")!,
                    );
                },
            },
        ],
        pixelRatio: 1,
    });
    window.addEventListener("pagehide", () => app.dispose(), { once: true });
    if (stepped) {
        (window as unknown as { step: () => Promise<void> }).step = async () => {
            app.world.step(1 / 60);
            await app.world.frameFence;
        };
        app.world.step(0);
        await app.world.frameFence;
    }
    document.body.dataset.ready = "true";
} catch (error) {
    document.querySelector("#status")!.textContent = "WebGPU initialization failed. See console.";
    console.error(error);
}
