# TypeScript Boundaries

Gameplay, simulation, test routes, scene construction, and capture sequencing belong in Workman.
Files in this directory are limited to runtime boundaries Workman cannot yet express cleanly:

- `rapier_helpers.ts`: structural field reads from Rapier objects.
- `artifacts.ts`: JSON/filesystem output, headless WebGPU bootstrap, narrow object-method bridges,
  framebuffer PNG encoding, and artifact validation.

Do not add game rules or test scenario logic here. When Workman gains the required FFI or binary
I/O support, migrate the corresponding boundary and remove the helper.
