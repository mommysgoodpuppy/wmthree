import { PNG } from "pngjs";
import { RenderTarget, WebGPURenderer } from "three/webgpu";

const width = 640;
const height = 480;

type CaptureEntry = {
  id: string;
  title: string;
  note: string;
  frame: number;
  timeMs: number;
  piloting: boolean;
  fishing: boolean;
  fishCaught: number;
  png: string;
  actualViewPng?: string;
  json: string;
};

const captures: CaptureEntry[] = [];

function ensureDir(path: string): void {
  Deno.mkdirSync(path, { recursive: true });
}

function removeIfExists(path: string): void {
  try {
    Deno.removeSync(path, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}

export function resetArtifacts(root: string): string {
  captures.length = 0;
  removeIfExists(root);
  ensureDir(`${root}/images`);
  ensureDir(`${root}/states`);
  return root;
}

export function captureSnapshot(
  root: string,
  id: string,
  title: string,
  note: string,
  frame: number,
  timeMs: number,
  playerX: number,
  playerY: number,
  playerZ: number,
  playerVy: number,
  yaw: number,
  pitch: number,
  mechX: number,
  mechY: number,
  mechZ: number,
  mechYaw: number,
  piloting: boolean,
  fishing: boolean,
  fishCaught: number,
  hookX: number,
  hookY: number,
  hookZ: number,
): string {
  const png = `images/${id}.png`;
  const json = `states/${id}.json`;
  const state = {
    id,
    title,
    note,
    frame,
    timeMs,
    player: { x: playerX, y: playerY, z: playerZ, vy: playerVy, yaw, pitch },
    mech: { x: mechX, y: mechY, z: mechZ, yaw: mechYaw, piloting },
    fishing: { active: fishing, caught: fishCaught, hook: { x: hookX, y: hookY, z: hookZ } },
  };
  Deno.writeTextFileSync(`${root}/${json}`, JSON.stringify(state, null, 2));
  captures.push({ id, title, note, frame, timeMs, piloting, fishing, fishCaught, png, json });
  return `${root}/${json}`;
}

export function writeManifest(root: string, name: string, summary: string): string {
  const path = `${root}/manifest.json`;
  Deno.writeTextFileSync(path, JSON.stringify({
    name,
    summary,
    generatedAt: new Date().toISOString(),
    coordinateView: "Orthographic Three/WebGPU X/Z view rendered from the captured gameplay scene.",
    captures,
  }, null, 2));
  return path;
}

type ActualRendererHandles = { renderer: unknown; target: unknown };

export async function createActualRenderer(renderWidth: number, renderHeight: number): Promise<ActualRendererHandles> {
  Object.assign(globalThis, {
    requestAnimationFrame: (_callback: unknown) => 0,
    cancelAnimationFrame: (_id: number) => undefined,
  });
  const canvas = new OffscreenCanvas(renderWidth, renderHeight);
  const renderer = new WebGPURenderer({ canvas, antialias: false, alpha: false });
  renderer.setSize(renderWidth, renderHeight, false);
  await renderer.init();
  const target = new RenderTarget(renderWidth, renderHeight, { depthBuffer: true, stencilBuffer: false });
  return { renderer, target };
}

export function ensureActualDir(root: string): string {
  ensureDir(`${root}/actual_views`);
  ensureDir(`${root}/images`);
  return root;
}

export function setPosition(
  object: { position: { set: (x: number, y: number, z: number) => unknown } },
  x: number,
  y: number,
  z: number,
): void {
  object.position.set(x, y, z);
}

export function setRotation(
  object: { rotation: { set: (x: number, y: number, z: number) => unknown } },
  x: number,
  y: number,
  z: number,
): void {
  object.rotation.set(x, y, z);
}

export function setCastReceive(object: { castShadow?: boolean; receiveShadow?: boolean }): void {
  object.castShadow = true;
  object.receiveShadow = true;
}

export function addChild(parent: { add: (child: unknown) => unknown }, child: unknown): void {
  parent.add(child);
}

export function setSceneBackground(scene: { background: unknown }, color: unknown): void {
  scene.background = color;
}

export async function renderTargetPixels(
  renderer: {
    setRenderTarget: (target: unknown) => unknown;
    render: (scene: unknown, camera: unknown) => unknown;
    readRenderTargetPixelsAsync: (
      target: unknown,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => Promise<Uint8Array>;
  },
  target: unknown,
  scene: unknown,
  camera: unknown,
): Promise<Uint8Array> {
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  return await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
}

function writeGpuPng(root: string, folder: string, id: string, value: unknown): string {
  const pixels = value as Uint8Array;
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    const sourceY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const source = (sourceY * width + x) * 4;
      const target = (y * width + x) * 4;
      png.data[target] = pixels[source];
      png.data[target + 1] = pixels[source + 1];
      png.data[target + 2] = pixels[source + 2];
      png.data[target + 3] = pixels[source + 3];
    }
  }
  const relative = `${folder}/${id}.png`;
  Deno.writeFileSync(`${root}/${relative}`, PNG.sync.write(png));
  return relative;
}

export function writeActualPngValue(root: string, id: string, pixels: unknown): string {
  return writeGpuPng(root, "actual_views", id, pixels);
}

export function writeTopdownPngValue(root: string, id: string, pixels: unknown): string {
  return writeGpuPng(root, "images", id, pixels);
}

export function patchActualManifest(root: string): string {
  const path = `${root}/manifest.json`;
  const manifest = JSON.parse(Deno.readTextFileSync(path)) as {
    captures: CaptureEntry[];
    actualGameView?: string;
  };
  manifest.actualGameView =
    "Perspective and orthographic Three/WebGPU render-target readbacks generated by tests/playtest/actual_render.wm.";
  manifest.captures = manifest.captures.map((capture) => ({
    ...capture,
    actualViewPng: `actual_views/${capture.id}.png`,
  }));
  Deno.writeTextFileSync(path, JSON.stringify(manifest, null, 2));
  return path;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((byte, index) => bytes[index] !== byte)) throw new Error("invalid PNG signature");
  if (new TextDecoder().decode(bytes.slice(12, 16)) !== "IHDR") throw new Error("PNG missing IHDR chunk");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function verifyPng(path: string, label: string): Promise<void> {
  const size = pngDimensions(await Deno.readFile(path));
  if (size.width !== width || size.height !== height) {
    throw new Error(`${label}: expected ${width}x${height}, got ${size.width}x${size.height}`);
  }
}

export async function verifyArtifacts(root: string): Promise<string> {
  const manifest = JSON.parse(await Deno.readTextFile(`${root}/manifest.json`)) as {
    name: string;
    captures: CaptureEntry[];
  };
  if (!manifest.name || !Array.isArray(manifest.captures) || manifest.captures.length < 5) {
    throw new Error("manifest must contain a name and at least five captures");
  }
  for (const capture of manifest.captures) {
    if (capture.frame < 0 || capture.timeMs < 0) throw new Error(`${capture.id}: invalid frame or time`);
    await verifyPng(`${root}/${capture.png}`, `${capture.id} top-down view`);
    if (capture.actualViewPng) await verifyPng(`${root}/${capture.actualViewPng}`, `${capture.id} game view`);
    const state = JSON.parse(await Deno.readTextFile(`${root}/${capture.json}`)) as { id?: string };
    if (state.id !== capture.id) throw new Error(`${capture.id}: sidecar state id mismatch`);
  }
  if (!manifest.captures.some((capture) => capture.fishing)) throw new Error("missing active fishing capture");
  if (!manifest.captures.some((capture) => capture.fishCaught > 0 && !capture.fishing)) {
    throw new Error("missing completed catch capture");
  }
  return `snapshot artifacts verified: ${manifest.captures.length} captures`;
}

if (import.meta.main) {
  console.log(await verifyArtifacts(Deno.args[0] ?? "artifacts/playtest/latest"));
}
