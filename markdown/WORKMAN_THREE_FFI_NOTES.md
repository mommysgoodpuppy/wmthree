# Workman Three/WebGPU Experiment Status

Updated: 2026-06-20

This document records what the `wmthree` experiment found in Workman's safe JavaScript FFI, what
was fixed in `wm-mini`, and what remains. Most original compiler blockers are now resolved.

The constraints remain:

- no `unsafe` imports
- no reflection workaround in application code
- no type annotations used as FFI casts
- `wm check`, `wm compile`, and `wm run` own the complete workflow
- ordinary Workman `Result`, `Task`, records, carrier lifts, and reflected imports

## Current Application

`C:\GIT\wmthree\main.wm` now does all of the following in Workman:

- loads SDL2 through reflected `Deno.dlopen`
- obtains typed SDL symbols through `_deep_` reflection
- creates an SDL window and extracts its Win32 handles
- creates `Deno.UnsafeWindowSurface` and a WebGPU context
- constructs a Three WebGPU scene, meshes, materials, camera, and renderer
- awaits `WebGPURenderer.init()` through `Task`
- updates a Three object every frame from immutable Workman game state
- decodes SDL keyboard and signed relative-mouse events
- moves an FPS camera from immutable Workman game state
- exits on `SDL_QUIT` or Escape
- runs continuously by default, with an optional positional frame cap for automated checks
- uses tail-recursive polling and frame drivers that compile to JavaScript loops

The setup path uses two central Workman patterns:

- `Monad.lift` for dependent carrier pipelines
- `Result|...|` and `Task|...|` for collecting independent effects

Explicit `match` remains at state-machine boundaries where it improves reviewability and keeps
recursive self-calls visible to tail-call lowering.

## Resolved Compiler Blockers

### 1. Nested Deno global reflection

**Status: resolved.**

The reflection host now treats `Deno.*` paths as Deno declaration sources. Its virtual TypeScript
source is rooted so project-local packages and declarations resolve correctly.

This enables safe imports such as:

```wm
from js.global("Deno.UnsafePointer") import { of as pointerOf };
from js.global("Deno") import { UnsafePointerView, UnsafeWindowSurface };
```

### 2. Constructor-valued global members

**Status: resolved.**

Constructor-valued members expose `.new`, and constructor result refs retain their complete global
path. `UnsafePointerView.new(...)` therefore produces a receiver whose methods can be reflected as
`Deno.UnsafePointerView` methods.

The fix covered:

- detecting constructors exported from global members
- generating `.new` bindings
- canonicalizing constructor return refs
- preserving the strongest known foreign ref instead of replacing it with a root-global fallback

### 3. Constructor-valued module exports

**Status: resolved.**

Classes imported from modules now construct through the imported module member rather than a global
name. This supports ordinary Three imports:

```wm
from js.module("three/webgpu") import { Scene, Mesh, WebGPURenderer };

let scene = Scene.new();
```

The emitter distinguishes module constructors and emits `new module[member](...)` under the safe FFI
wrapper.

### 4. Receiver reflection and foreign ref preservation

**Status: resolved for the current application.**

Constructor results and reflected receiver results carry enough nominal evidence for chained calls
such as:

```wm
camera.position.set(0, 1.4, 4)
renderer.render(scene, camera)
surface.present()
```

The application no longer needs receiver annotations. Foreign receiver evidence comes from imports,
constructors, and reflected structure.

### 5. Unresolved FFI values becoming accidental generics

**Status: resolved.**

This was the most important correctness issue found during the experiment. An unresolved `?ffi`
value must not become a generic type, disappear because its value is discarded, or be resolved from
a user annotation.

The current model is stricter:

- unresolved FFI values remain explicit obligations
- annotations are checked after inference and are not receiver evidence
- unresolved obligations cannot escape through binding, matching, operators, calls, or discard
- top-level and consumed unresolved obligations are rejected
- static import/reflection structure resolves the obligation

This removed the need for broad `Js.Value` or `Js.Object` fallbacks that previously materialized too
early and prevented later reflection from finding a precise type.

### 6. Generic TypeScript return types from `Deno.dlopen`

**Status: resolved through opt-in deep reflection.**

The original notes treated `sdl.symbols.*` as dynamic `Js.Object` calls because Workman could not
carry TypeScript generic results such as:

```ts
Deno.DynamicLibrary<SdlSymbols>
```

Imports can now request deep result reflection:

```wm
from js.global("Deno") import {
  dlopen: _deep_,
  UnsafePointerView,
  UnsafeWindowSurface,
};
```

When `dlopen` receives a literal descriptor, TypeScript resolves its generic result and Workman
reflects the resulting record deeply. Accessing `sdl.symbols.SDL_PollEvent` therefore reaches its
actual reflected signature instead of relying on a numeric pattern or annotation to cast a dynamic
result.

Deep reflection is opt-in because recursive TypeScript object graphs are expensive and unnecessary
for most imports.

### 7. Promise-returning renderer initialization

**Status: supported by the existing language.**

`renderer.init()` returns a Workman `Task`. Scene setup remains in `Result`, crosses into `Task` at
the asynchronous boundary, and renders only after initialization succeeds.

No special Three behavior was added to the compiler.

### 8. Deno WebGPU launch configuration

**Status: resolved in the CLI.**

`wm run` adds `--unstable-webgpu` when generated code references `Deno.UnsafeWindowSurface`. The
application is still launched with:

```sh
wm run main.wm
```

### 9. Direct tail recursion

**Status: resolved.**

Direct self-calls in tail position compile to labeled JavaScript `while (true)` loops with argument
rebinding and `continue`.

The application separates non-recursive effectful steps from recursive drivers:

- `pollEvent` returns `PollStep`; `pollQuit` drives it
- `stepFrame` returns `FrameStep`; `spinFrames` drives it

This leaves one explicit `Err(e) => { Err(e) }` propagation arm in each driver while keeping the
recursive call directly visible to the compiler.

Calls hidden inside `Monad.lift` callbacks are not currently recognized as direct tail calls. That
is an acceptable documented boundary: synchronous `Result` callbacks and asynchronous `Task`
callbacks cannot be treated identically without carrier-aware Core lowering.

## Superseded Approaches

The following ideas appeared during investigation but do not describe the current compiler:

- using Workman type annotations as dynamic receiver evidence
- resolving FFI calls from contextual annotations
- eagerly materializing unresolved receivers as `Js.Value` or `Js.Object`
- special-casing `Deno.dlopen` receiver access
- threading reflection refs manually through application values

They were useful probes, but each weakened static evidence or moved reflection information through
the wrong layer. The current design keeps unresolved FFI obligations until real import or reflected
structure solves them.

## Application Work Remaining

The compiler and FFI bootstrap are no longer the primary blockers. Remaining work is mostly engine
functionality:

### Real frame loop and timing

The game now runs until SDL quit or Escape. Tail-call lowering makes the synchronous loop stack-safe,
and movement uses clamped delta time from `performance.now()`. A positional frame cap remains
available for automated checks. The engine still needs explicit frame pacing.

### Input follow-ups

SDL keydown, keyup, and relative mouse events now become an immutable Workman input snapshot.
WASD movement and mouse-look are pure transitions in `game.wm`. Remaining input work includes focus
changes, controller support, configurable bindings, and click actions.

### Resource cleanup

The shutdown path should call:

- `SDL_DestroyWindow`
- `SDL_Quit`
- the dynamic library close operation when appropriate
- Three renderer/resource disposal methods

Cleanup should run for both success and error outcomes.

### Platform support

The current `UnsafeWindowSurface` path is Win32-specific. macOS and Linux SDL window-manager layouts
still need explicit branches and validation.

### RAF compatibility shim

Three expects global `requestAnimationFrame` and `cancelAnimationFrame`. The current Workman record
installed with `Object.assign` is intentionally a minimal initialization shim because the app drives
rendering itself. A real scheduler may be needed if later Three features depend on active RAF
callbacks.

### C string ergonomics

The SDL title is an explicit NUL-terminated `Uint8Array` because Workman does not currently expose a
convenient `\0` string escape or standard C-string helper.

### Foreign handles in larger records

Directly threaded Three and Deno handles work. Before designing the final engine state, nested
foreign handles inside larger Workman records should receive a focused regression test. This is no
longer a demonstrated blocker, but the larger ownership shape has not yet been exercised here.

### Rapier integration status

Rapier now initializes during `main.wm` startup and a kinematic capsule is stepped each frame through
`KinematicCharacterController`. Static Rapier cuboids are built from the same `worldSolids()` and
`mechSolids()` lists that render the visible boxes, plus a broad ground slab.

Two current boundaries are worth preserving as regression targets:

- Importing a Workman module that itself imports JS can emit `await import(...)` inside a synchronous
  generated module wrapper. For now, the entry module owns the runtime Rapier imports directly;
  `physics.wm` remains a checked reference boundary.
- Rapier's `Vector` is a TypeScript interface. Direct `computedMovement().x` / `body.translation().x`
  projection does not currently resolve as a reflected JS field. `rapier_helpers.ts` is intentionally
  narrow and only reads numeric vector components from typed Rapier handles.

### Imported record projection inside lifted callbacks

A projection such as `inputGame.controls.quit` inside an unannotated `lift Result` callback was
incorrectly sent to JS FFI receiver resolution. Local record declarations infer in this shape, and
an explicit imported `Game` parameter annotation also works, but later application to
`Result<Game, E>` does not currently recover the imported record during structural projection
inference. Nested projection also requires the nested `Controls` record declaration to be imported.
The current application keeps the module boundary opaque with pure exported queries such as
`shouldQuit`, `cameraX`, and `cameraZ`.

This is not an application blocker, but it is a concrete compiler regression candidate: imported
nominal Workman records should remain ordinary records when they flow through lifted functions.

## Verification

Current application verification:

```sh
wm check main.wm
wm compile main.wm
wm run main.wm
```

Observed result:

```txt
ok
workman three bootstrap ok
```

Generated-code inspection confirms both recursive drivers contain labeled loops and `continue`
statements rather than recursive JavaScript calls.

Relevant `wm-mini` regression coverage includes:

- nested Deno/global constructor reflection
- module constructor imports
- deep `Deno.dlopen` result reflection
- unresolved FFI escape rejection
- delayed receiver reflection
- direct tail-call lowering
- CLI WebGPU launch configuration

## Current Conclusion

The experiment succeeded at its original purpose. Safe Workman can now express and launch a native
SDL + Deno WebGPU + Three application without unsafe imports, reflection code in the application, or
annotation-based FFI casts.

The next useful pressure comes from building the game itself: input snapshots, timing, camera
movement, collision/physics, resource ownership, and a long-running frame loop.
