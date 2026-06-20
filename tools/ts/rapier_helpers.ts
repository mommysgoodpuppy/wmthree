import type {
  KinematicCharacterController,
  RigidBody,
  Vector,
} from "@dimforge/rapier3d-compat";

export function vector(x: number, y: number, z: number): Vector {
  return { x, y, z };
}

export function vectorX(v: Vector): number {
  return v.x;
}

export function vectorY(v: Vector): number {
  return v.y;
}

export function vectorZ(v: Vector): number {
  return v.z;
}

export function bodyX(body: RigidBody): number {
  return body.translation().x;
}

export function bodyY(body: RigidBody): number {
  return body.translation().y;
}

export function bodyZ(body: RigidBody): number {
  return body.translation().z;
}

export function controllerMoveX(controller: KinematicCharacterController): number {
  return controller.computedMovement().x;
}

export function controllerMoveY(controller: KinematicCharacterController): number {
  return controller.computedMovement().y;
}

export function controllerMoveZ(controller: KinematicCharacterController): number {
  return controller.computedMovement().z;
}
