# Workman Three/WebGPU FPS

A small native FPS experiment written in Workman. The application combines:

- SDL2 for the native window and input
- Deno's `UnsafeWindowSurface` for the WebGPU presentation surface
- Three.js `WebGPURenderer` for rendering
- pure Workman modules for immutable game state and movement

The project is also a language stress test. New engine features should be implemented in Workman
first so genuine compiler and FFI limitations become visible instead of being hidden behind a large
TypeScript layer.

## Repository Layout

```txt
C:\GIT\wmthree
  main.wm                       SDL, WebGPU, Three, input, rendering, frame loop
  game.wm                       Pure immutable FPS state and movement
  trig.wm                       Pure Workman sine and cosine
  threedeno.ts                  Original TypeScript reference implementation
  SDL2.dll                      Native SDL2 library used on Windows
  deno.json                     Three.js dependency and Deno configuration
  WORKMAN_THREE_FFI_NOTES.md    Resolved blockers and remaining edges
```

The Workman compiler repository is:

```txt
C:\GIT\wm-mini
```

## Running the Game

Run commands from the game directory:

```powershell
cd C:\GIT\wmthree
```

### Interactive run

```powershell
wm run main.wm
```

With no arguments, the game runs until one of these events occurs:

- the SDL window is closed
- Escape is pressed

Controls:

```txt
W / S       move forward / backward
A / D       strafe left / right
E           enter / exit the cockpit pilot seat when near the controls
Space       jump on foot; cast the mech fishing rig while piloting
Mouse       look
Escape      exit
```

SDL relative mouse mode is enabled after window creation.

When seated in the cockpit, W / S drives the mech forward and backward, A / D turns it, and the
camera rides with the pilot station. Space drops the forward fishing hook for a short cast; catches
are counted when the hook lands in the pond.

### Fixed frame run

Pass one positive integer after `--` to stop automatically after that many frames:

```powershell
wm run main.wm -- 180
```

This is useful for compiler and runtime checks because it does not require manually closing the
window.

Examples:

```powershell
wm run main.wm -- 1
wm run main.wm -- 60
wm run main.wm -- 600
```

Invalid limits fail before SDL initialization:

```powershell
wm run main.wm -- 0
```

### Type-check only

```powershell
wm check main.wm
```

`wm check` checks the complete Workman module graph, including `game.wm` and `trig.wm`.

### Compile without running

```powershell
wm compile main.wm out.mjs
```

The emitted JavaScript can be inspected when validating lowering, reflected imports, or tail-call
optimization.

For example, direct tail recursion should emit labeled loops:

```powershell
Select-String -Path out.mjs -Pattern '__wm_tail_|while \(true\)'
```

## Workman CLI Basics

The `wm` command is installed globally. Its primary commands are:

```txt
wm check <file.wm>               type-check a module graph
wm compile <file.wm> [out.js]    emit JavaScript
wm run <file.wm> [-- args...]    compile and execute with Deno
wm type-debug <file.wm>          print staged type-checker state on failure
wm help                          show CLI help
```

The compatibility form also compiles:

```powershell
wm main.wm out.mjs
```

Prefer the explicit command names in documentation and scripts.

Use `wm type-debug` when a normal diagnostic does not explain an unresolved type or FFI obligation:

```powershell
wm type-debug main.wm
```

## Workman Documentation

Current language documentation is under:

```txt
C:\GIT\wm-mini\docs
```

Important references:

```txt
C:\GIT\wm-mini\docs\wm-minisyntaxguide.md   Current syntax and supported features
C:\GIT\wm-mini\docs\carriers.md            Result|...|, Task|...|, and carrier coercion
C:\GIT\wm-mini\docs\async.md               Task semantics and eager Promise handles
C:\GIT\wm-mini\docs\jsffi.md               Safe JavaScript FFI
C:\GIT\wm-mini\docs\smlparallels.md         Workman and SML design parallels
```

Read `wm-minisyntaxguide.md` before relying on older notes. Workman evolves quickly, and historical
documents may describe limitations that have already been removed.

Compiler design notes and open issues are under:

```txt
C:\GIT\wm-mini\markdown
C:\GIT\wm-mini\markdown\issues
```

The imported-record projection issue discovered by this game is documented at:

```txt
C:\GIT\wm-mini\markdown\issues\imported-record-projection-in-lifted-callback.md
```

## Workman Examples

General examples:

```txt
C:\GIT\wm-mini\examples
```

The most relevant high-quality safe Workman examples are:

```txt
C:\GIT\wm-mini\examples\raylib
```

Useful projects inside that directory include:

```txt
raylib\main.wm                 Small Result/lift rendering example
raylib\orbital                 Pure simulation plus an FFI renderer
raylib\orbital_run             Larger game and immutable scene state machine
raylib\colony                  Larger simulation
raylib\colony\main3d.wm       3D camera, input, rendering, and tail-recursive loop
```

These examples are preferred references for application structure. Some other historical notes and
experiments may use older language patterns.

## Core Design Patterns

### Pure core, impure boundary

Keep game rules and state transitions in ordinary Workman modules:

```txt
input snapshot + game state + delta time -> next game state
```

`game.wm` owns:

- controls
- player position
- yaw and pitch
- delta-time movement
- camera query functions

`main.wm` owns:

- SDL FFI
- event decoding
- Three object creation
- projection of game state into mutable Three objects
- rendering and presentation

Three objects are intentionally mutable at the FFI boundary. Workman game state remains immutable.

### Lift dependent carrier computations

`Monad.lift` turns a function into one that consumes a value already inside a carrier:

```wm
let build = lift Result (value) => {
  nextFallibleStep(value)
};

sourceResult :> build
```

This removes repetitive nested success/error matches while preserving typed errors.

Use named lifted stages when setup has dependencies:

```wm
loadLibrary()
  :> initialize
  :> openWindow
  :> attachSurface
```

### Collect independent carrier values

Use explicit carrier bars when several independent values are needed together:

```wm
Result|
  createScene(),
  createCamera(),
  createMaterial()
|
```

The result is one `Result` containing a tuple of successful values. The first error is propagated.

The same shape works for tasks:

```wm
Task|loadConfig(), loadAsset()|
```

Remember that Workman Tasks are eager Promise handles. Creating a Task starts its underlying
operation; carrier collection controls sequencing of results, not necessarily operation startup.

### Match decisions, not plumbing

Use `match` for actual domain choices:

- SDL event variants
- game-state transitions
- `Option` presence
- termination versus continuation

Do not build large match trees solely to forward `Err(e)` when `lift`, `Result|...|`, or `Task|...|`
expresses the same dependency more clearly.

### Preserve direct tail calls in recursive drivers

Workman compiles direct self-calls in tail position into JavaScript loops.

Keep effectful work in a non-recursive step function:

```wm
let stepFrame = (...) => {
  -- Read input, update state, and render.
  Ok(FrameNext(nextState))
};
```

Keep the recursive driver small and explicit:

```wm
let rec loop = (state) => {
  match(stepFrame(state)) {
    Ok(FrameDone(done)) => { Ok(done) },
    Ok(FrameNext(next)) => { loop(next) },
    Err(e) => { Err(e) }
  }
};
```

Do not hide a recursive call inside `Monad.lift`, `Result.andThen`, or another callback when direct
tail-call lowering is required. Calls inside callbacks are not syntactically direct self-calls.

### Normalize errors at subsystem boundaries

The application maps foreign errors into one application error union:

```wm
type AppError =
  | SdlError<Js.Error>
  | DenoError<Js.Error>
  | ThreeError<Js.Error>
  | Message<String>;
```

Small helpers keep this consistent:

```wm
let sdlResult = (value) => { value :> Result.mapErr(SdlError) };
let denoResult = (value) => { value :> Result.mapErr(DenoError) };
let threeResult = (value) => { value :> Result.mapErr(ThreeError) };
```

### Prefer module queries for opaque state

Game state can expose pure queries instead of requiring every caller to know nested record layout:

```wm
let shouldQuit = (game: Game) => { game.controls.quit };
let cameraX = (game: Game) => { game.x };
```

This improves module ownership and currently avoids an imported-record inference edge in
unannotated lifted callbacks.

## Minimal Standard Library Philosophy

Workman intentionally keeps its basis and standard library small. Application needs should not
automatically become language built-ins.

Use this order when adding capability:

1. Express it as ordinary Workman functions in a local `.wm` module.
2. Extract it into a reusable Workman library if more projects need it.
3. Import a small local TypeScript module when the operation requires a host primitive that Workman
   cannot express.
4. Add something to the Workman basis only when it is fundamental to the runtime model and cannot
   be represented honestly as a library.

Examples:

- Trigonometry is currently implemented in `trig.wm` rather than added to the basis.
- A future bitwise library can be `bits.wm` backed by a narrow `bits.ts` host module.
- Resource bracketing should first be explored as `Result`/`Task`/`SomeOtherCarrier` composition.
- Frame scheduling can be a local Task library backed by Promise and timer primitives.

The goal is not to avoid libraries. The goal is to make Workman flexible enough that libraries are
the normal solution.

## TypeScript Interop Policy

Workman can import TypeScript directly, but TypeScript should be the last local option rather than
the default implementation language for game features.

Use a `.ts` helper when all of these are true:

- the capability fundamentally depends on a JavaScript or Deno host primitive and wormkans ts/deno ffi is not enough
- ordinary Workman cannot express that primitive
- an existing typed dependency does not already provide it
- the helper can remain small, typed, deterministic, and easy to reflect

Good candidates (these may still be possible in workman, just an ai assumption):

- bitwise operations over JavaScript 32-bit integers
- Promise wrappers around callback-only host APIs
- platform-specific binary encoding helpers

Poor candidates:

- game-state transitions
- movement and collision rules
- entity management
- scene descriptions
- code added only to avoid writing idiomatic `Result` or `Task` composition

Keep TypeScript helpers narrow. Import them through safe Workman FFI and let TypeScript declarations
provide the static evidence.

## Safe FFI Rules

Avoid `unsafe` imports. They bypass the exact behavior this project is intended to test.

Prefer ordinary imports:

```wm
from js.module("three/webgpu") import {
  Scene,
  Mesh,
  MeshStandardMaterial,
  WebGPURenderer
};
```

Use deep reflection only for rare generic results whose useful structure is produced by TypeScript:

```wm
from js.global("Deno") import {
  dlopen: _deep_,
  UnsafePointerView,
  UnsafeWindowSurface
};
```

`Deno.dlopen` returns `Deno.DynamicLibrary<SdlSymbols>`. `_deep_` asks TypeScript to resolve that
generic result and lets Workman retain the reflected SDL symbol signatures.

Do not use Workman annotations as FFI casts. FFI obligations must be solved by real static evidence:

- imported declarations
- constructor return types
- reflected receiver structure
- deep reflected generic results

An unresolved `?ffi` value is a compiler obligation, not a generic value.

## Inspecting the Installed Three.js Version

The project currently maps Three through `deno.json`:

```json
"three": "npm:three@^0.184.0"
```

Check the resolved package version:

```powershell
Get-Content node_modules\three\package.json
```

Deno's resolved package is also available under:

```txt
C:\GIT\wmthree\node_modules\.deno\three@0.184.0\node_modules\three
```

Important locations:

```txt
build\three.webgpu.js            Actual WebGPU entry bundle and exports
src\renderers\webgpu             WebGPU-specific renderer implementation
src\renderers\common             Shared WebGPU/WebGL renderer infrastructure
src\materials                    Standard material implementations
src\lights                       Standard light implementations
src\nodes                        TSL and node-material implementation
examples\jsm                     Three add-ons and examples
```

Type declarations are available under:

```txt
C:\GIT\wmthree\node_modules\@types\three
```

Useful inspection commands:

```powershell
Select-String -Path node_modules\three\build\three.webgpu.js -Pattern 'MeshStandardMaterial'
Select-String -Path node_modules\three\build\three.webgpu.js -Pattern 'DirectionalLight'
Get-Content node_modules\@types\three\src\materials\MeshStandardMaterial.d.ts
Get-Content node_modules\@types\three\src\lights\DirectionalLight.d.ts
```

Inspect the installed source and declarations before assuming an API from a different Three release.

## Standard Materials Before TSL

Three's WebGPU renderer supports ordinary lights and standard materials. Basic lighting does not
require custom shaders.

The current scene uses:

- `MeshStandardMaterial`
- `HemisphereLight`
- `DirectionalLight`
- `PointLight`
- WebGPU shadow maps

Use standard Three features first for:

- PBR shading
- roughness and metalness
- direct lights
- shadows
- fog
- textures
- normal maps

Use TSL when the requested effect is genuinely custom:

- procedural materials
- animated shader effects
- custom vertex deformation
- nonstandard lighting models
- post-processing nodes

Prefer TSL over raw WGSL when Three's node system can express the effect. Raw WebGPU shaders should
be reserved for capabilities outside Three's material and TSL systems.

## Development Workflow

For each feature:

1. Define the smallest visible game behavior.
2. Decide whether it belongs in the pure core or the FFI boundary.
3. Implement it in Workman first.
4. Run `wm check main.wm` after each structural change.
5. Run a short capped probe such as `wm run main.wm -- 60`.
6. Inspect emitted JavaScript when validating TCO or reflection.
7. Record a reproducible compiler issue when Workman behavior is incorrect.
8. Use a local TypeScript helper only if the operation requires a missing host primitive.

Recommended verification before considering a feature complete:

```powershell
wm check main.wm
wm compile main.wm C:\tmp\wmthree-check.mjs
wm run main.wm -- 180
git diff --check
```

For visual changes, also run interactively and inspect movement, framing, lighting, shadows, and
resize/focus behavior where relevant.

## Current Known Edges

The initial Deno, `dlopen`, constructor, Three receiver, and WebGPU launch blockers have been fixed.
Current edges worth testing include:

- imported nested record projection in unannotated lifted callbacks
- cleanup composition for SDL, dynamic libraries, renderer, and GPU resources
- frame pacing through a local Task/timer library
- nested foreign handles in larger Workman records
- platform-specific SDL window-surface layouts
- C-string ergonomics
- future bitwise operations for masks and packed flags

See `WORKMAN_THREE_FFI_NOTES.md` for the detailed history and current status.

## Guiding Principle

Keep the game honest.

Game behavior should remain visible as Workman values and functions. Three, SDL, Deno, and small
TypeScript host helpers provide capabilities at the boundary; they should not absorb the game simply
because writing a wrapper is easier. When the language lacks something, first determine whether the
right answer is a Workman library, a narrow host library, or a real compiler fix.
