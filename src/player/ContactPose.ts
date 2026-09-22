import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import type { PlayerController } from "./PlayerController";

const UP = new THREE.Vector3(0, 1, 0);
const ease = THREE.MathUtils.smoothstep;
interface Chain {
  upper: THREE.Bone;
  lower: THREE.Bone;
  end: THREE.Bone;
}
/** Two-bone world-space IK on top of the sampled clip. Physics owns all anchors. */
export class ContactPose {
  private stride = 0;
  private bones = new Map<string, THREE.Bone>();
  private sampled: {
    bone: THREE.Bone;
    rotation: THREE.Quaternion;
    scale: THREE.Vector3;
  }[] = [];
  private arms: (Chain | null)[] = [];
  private legs: (Chain | null)[] = [];
  private origin = new THREE.Vector3();
  private joint = new THREE.Vector3();
  private endpoint = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private bend = new THREE.Vector3();
  private wantedJoint = new THREE.Vector3();
  private fingerTarget = new THREE.Vector3();
  private target = new THREE.Vector3();
  private edge = new THREE.Vector3();
  private lateral = new THREE.Vector3();
  private outward = new THREE.Vector3();
  private pole = new THREE.Vector3();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private parentQ = new THREE.Quaternion();
  private worldQ = new THREE.Quaternion();
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  /** Exposed for contact regression tests and the F3 inspector. */
  readonly handErrors = [0, 0];
  readonly handTargets = [new THREE.Vector3(), new THREE.Vector3()];
  activeHands = 0;
  constructor(
    private model: THREE.Group,
    private p: PlayerController,
  ) {
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone)
        this.bones.set(o.name.replace(/^mixamorig\d*/, ""), o as THREE.Bone);
    });
    this.sampled = Array.from(this.bones.values()).map((bone) => ({
      bone,
      rotation: bone.quaternion.clone(),
      scale: bone.scale.clone(),
    }));
    for (const side of ["Left", "Right"]) {
      this.arms.push(this.chain(side + "Arm", side + "ForeArm", side + "Hand"));
      this.legs.push(this.chain(side + "UpLeg", side + "Leg", side + "Foot"));
    }
  }
  restore(): void {
    for (const s of this.sampled) {
      s.bone.quaternion.copy(s.rotation);
      s.bone.scale.copy(s.scale);
    }
  }
  private chain(a: string, b: string, c: string): Chain | null {
    const upper = this.bones.get(a),
      lower = this.bones.get(b),
      end = this.bones.get(c);
    return upper && lower && end ? { upper, lower, end } : null;
  }
  private aim(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
    bone.getWorldPosition(this.a);
    child.getWorldPosition(this.b);
    this.b.sub(this.a).normalize();
    this.a.copy(target).sub(bone.getWorldPosition(this.origin)).normalize();
    this.q.setFromUnitVectors(this.b, this.a);
    bone.getWorldQuaternion(this.worldQ);
    this.worldQ.premultiply(this.q);
    bone.parent!.getWorldQuaternion(this.parentQ).invert();
    bone.quaternion.copy(this.parentQ.multiply(this.worldQ));
    bone.updateWorldMatrix(false, true);
  }
  private solve(chain: Chain, target: THREE.Vector3, pole: THREE.Vector3) {
    chain.upper.getWorldPosition(this.origin);
    chain.lower.getWorldPosition(this.joint);
    chain.end.getWorldPosition(this.endpoint);
    const l1 = this.origin.distanceTo(this.joint),
      l2 = this.joint.distanceTo(this.endpoint);
    this.direction.copy(target).sub(this.origin);
    const distance = THREE.MathUtils.clamp(
      this.direction.length(),
      Math.abs(l1 - l2) + 0.001,
      l1 + l2 - 0.001,
    );
    this.direction.normalize();
    this.bend
      .copy(pole)
      .sub(this.origin)
      .addScaledVector(
        this.direction,
        -this.bend.copy(pole).sub(this.origin).dot(this.direction),
      );
    if (this.bend.lengthSq() < 0.00001)
      this.bend.crossVectors(this.direction, UP);
    this.bend.normalize();
    const along = (distance * distance + l1 * l1 - l2 * l2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    this.wantedJoint
      .copy(this.origin)
      .addScaledVector(this.direction, along)
      .addScaledVector(this.bend, height);
    this.aim(chain.upper, chain.lower, this.wantedJoint);
    this.aim(chain.lower, chain.end, target);
  }
  private local(x: number, y: number, z: number, out: THREE.Vector3) {
    out.set(x, y, z);
    return this.p.mesh.localToWorld(out);
  }
  private hands(
    center: THREE.Vector3,
    lateral: THREE.Vector3,
    weight: number,
    both = true,
  ) {
    const p = this.p;
    // Rail parameter direction is arbitrary. Match left/right to the rig,
    // otherwise hands cross and the arm target becomes unreachable.
    if (this.arms[0] && this.arms[1]) {
      this.arms[0].upper.getWorldPosition(this.a);
      this.arms[1].upper.getWorldPosition(this.b);
      if (this.a.sub(this.b).dot(lateral) < 0) lateral.negate();
    }
    // A contact pose may move the visual torso slightly relative to the capsule.
    // Solve reach before the limbs; never stretch arm bones to fake contact.
    for (let pass = 0; pass < 3; pass++)
      for (let i = 0; i < (both ? 2 : 1); i++) {
        const chain = this.arms[i];
        if (!chain) continue;
        chain.upper.getWorldPosition(this.origin);
        chain.lower.getWorldPosition(this.joint);
        chain.end.getWorldPosition(this.endpoint);
        const reach =
          this.origin.distanceTo(this.joint) +
          this.joint.distanceTo(this.endpoint);
        this.target
          .copy(center)
          .addScaledVector(lateral, (i === 0 ? 1 : -1) * 0.21);
        this.a.copy(this.target).sub(this.origin);
        const gap = this.a.length() - reach * 0.94;
        if (gap > 0.001) {
          this.a.normalize().multiplyScalar(Math.min(0.35, gap) * weight);
          p.mesh.getWorldQuaternion(this.parentQ).invert();
          this.a.applyQuaternion(this.parentQ);
          this.model.position.add(this.a);
          p.mesh.updateMatrixWorld(true);
        }
      }
    for (let i = 0; i < 2; i++) {
      const chain = this.arms[i];
      if (!chain || (!both && i === 1)) continue;
      const side = i === 0 ? 1 : -1;
      this.target.copy(center).addScaledVector(lateral, side * 0.21);
      chain.end.getWorldPosition(this.endpoint);
      this.target.lerp(this.endpoint, 1 - weight);
      this.handTargets[i].copy(this.target);
      this.local(side * 0.65, 0.1, -0.3, this.pole);
      this.solve(chain, this.target, this.pole);
      this.handErrors[i] = chain.end
        .getWorldPosition(this.endpoint)
        .distanceTo(this.target);
      this.activeHands++;
      const middle = this.bones.get(
        (i === 0 ? "Left" : "Right") + "HandMiddle1",
      );
      if (middle) {
        p.mesh
          .getWorldDirection(this.fingerTarget)
          .multiplyScalar(0.12)
          .add(this.handTargets[i]);
        this.fingerTarget.y -= 0.035;
        this.aim(chain.end, middle, this.fingerTarget);
      }
      // Close fingers around the edge/bar; the wrist stays on its measured target.
      const prefix = i === 0 ? "Left" : "Right";
      for (const finger of ["Index", "Middle", "Ring", "Pinky"])
        for (let n = 1; n <= 3; n++) {
          const bone = this.bones.get(`${prefix}Hand${finger}${n}`);
          if (bone) bone.rotation.z += (i === 0 ? -1 : 1) * 0.55 * weight;
        }
    }
    p.mesh.updateMatrixWorld(true);
  }
  update(_dt: number) {
    for (const s of this.sampled) {
      s.rotation.copy(s.bone.quaternion);
      s.scale.copy(s.bone.scale);
    }
    const p = this.p,
      state = p.fsm.current;
    this.stride += p.horizontalSpeed * _dt;
    this.activeHands = 0;
    this.handErrors.fill(0);
    // Keep the imported character's identity, with less exaggerated head proportions.
    const head = this.bones.get("Head");
    if (head) head.scale.setScalar(0.82);
    if (state === "BALANCE") this.model.position.y -= 0.12;
    p.mesh.updateMatrixWorld(true);
    if (state === "AIR" && p.airTricks.tuckWeight > 0) {
      const weight = p.airTricks.tuckWeight;
      const hips = this.bones.get("Hips");
      if (hips) {
        hips.getWorldPosition(this.edge);
        p.mesh.worldToLocal(this.edge);
        // Feet below the pelvis, knees forward toward the chest. Targets are
        // in body space so front/back/side flips share the same compact pose.
        for (let i = 0; i < 2; i++) {
          const side = i === 0 ? 1 : -1;
          const leg = this.legs[i];
          if (leg) {
            leg.end.getWorldPosition(this.endpoint);
            this.local(this.edge.x + side * 0.16, this.edge.y - 0.18, this.edge.z + 0.2, this.target);
            this.target.lerp(this.endpoint, 1 - weight);
            this.local(this.edge.x + side * 0.2, this.edge.y + 0.65, this.edge.z + 1, this.pole);
            this.solve(leg, this.target, this.pole);
          }
          const arm = this.arms[i];
          if (arm && leg) {
            leg.lower.getWorldPosition(this.target);
            arm.end.getWorldPosition(this.endpoint);
            this.target.lerp(this.endpoint, 1 - weight);
            this.local(side * 0.65, 0.15, 0.65, this.pole);
            this.solve(arm, this.target, this.pole);
          }
        }
      }
    } else if (state === "HANG" && p.climb.grab) {
      p.climb.edgePoint(this.edge);
      p.climb.outward(this.outward);
      this.lateral.crossVectors(UP, this.outward).normalize();
      const t = p.mantleProgress;
      const release = t < 0 ? 1 : 1 - ease(t, 0.58, 0.86);
      // Hands remain planted during the pull and press, then leave the coping.
      this.edge.y += 0.065;
      this.hands(this.edge, this.lateral, release);
      // Feet press against the wall, then step over the ledge in sequence.
      for (let i = 0; i < 2; i++) {
        const chain = this.legs[i];
        if (!chain) continue;
        const step =
          t < 0 ? 0 : ease(t, i === 0 ? 0.35 : 0.55, i === 0 ? 0.78 : 0.97);
        p.climb.edgePoint(this.target);
        this.target
          .addScaledVector(this.lateral, i === 0 ? 0.17 : -0.17)
          .addScaledVector(
            this.outward,
            THREE.MathUtils.lerp(0.12, -0.36, step),
          );
        this.target.y += THREE.MathUtils.lerp(-1.18, 0.12, step);
        this.local(i === 0 ? 0.22 : -0.22, -0.25, 0.9, this.pole);
        this.solve(chain, this.target, this.pole);
      }
    } else if (state === "SWING" && p.swinger.grip(this.edge, this.lateral)) {
      this.edge.y += 0.025;
      // Match the skeleton's actual arm reach rather than a guessed model offset.
      const chain = this.arms[0];
      if (chain) {
        chain.upper.getWorldPosition(this.origin);
        chain.lower.getWorldPosition(this.joint);
        chain.end.getWorldPosition(this.endpoint);
        const reach =
          this.origin.distanceTo(this.joint) +
          this.joint.distanceTo(this.endpoint);
        const gap = this.origin.distanceTo(this.edge) - reach * 0.9;
        if (gap > 0) {
          this.model.position.y += Math.min(0.45, gap);
          p.mesh.updateMatrixWorld(true);
        }
      }
      this.hands(this.edge, this.lateral, 1);
    } else if (state === "VAULT" && p.activeVault) {
      const t = p.vaultProgress,
        plan = p.activeVault;
      const tuck = ease(t, 0.05, 0.3) * (1 - ease(t, 0.6, 0.95));
      p.mesh.rotation.x = 0.25 * tuck;
      p.mesh.rotation.z = 0.16 * tuck;
      p.mesh.updateMatrixWorld(true);
      this.edge.copy(plan.contact);
      this.lateral.crossVectors(UP, plan.direction).normalize();
      const contact = ease(t, 0.05, 0.2) * (1 - ease(t, 0.36, 0.55));
      if (contact > 0) this.hands(this.edge, this.lateral, contact, false);
      for (let i = 0; i < 2; i++) {
        const chain = this.legs[i];
        if (!chain) continue;
        chain.end.getWorldPosition(this.endpoint);
        this.local((i === 0 ? 0.18 : -0.18) + (i === 0 ? 0.72 : 0.6) * tuck,
          -0.8 + 0.36 * tuck, (i === 0 ? 0.25 : -0.2) * tuck, this.target);
        if (t > 0.2 && t < 0.72) this.target.y = Math.max(this.target.y,plan.contact.y+0.12);
        this.target.lerp(this.endpoint, 1 - tuck);
        this.local(0.9, -0.25, 0.6, this.pole);
        this.solve(chain, this.target, this.pole);
      }
    } else if (state === "WALLRUN" && p.wallHit) {
      const hit = p.wallHit;
      this.outward.copy(hit.normal).setY(0).normalize();
      this.lateral.crossVectors(UP, this.outward).normalize();
      if (this.lateral.dot(p.velocity) < 0) this.lateral.negate();
      // Keep the torso clear of the wall. Feet alternately plant on its plane.
      this.a.copy(this.outward).multiplyScalar(0.12);
      p.mesh.getWorldQuaternion(this.parentQ).invert();
      this.model.position.add(this.a.applyQuaternion(this.parentQ));
      p.mesh.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) {
        const leg = this.legs[i];
        if (!leg) continue;
        const phase = this.stride * 7 + i * Math.PI;
        this.target.copy(hit.point).addScaledVector(this.outward, 0.1)
          .addScaledVector(this.lateral, Math.cos(phase) * 0.27);
        this.target.y = p.mesh.position.y - 0.45 + Math.sin(phase) * 0.17;
        this.pole.copy(this.target).addScaledVector(this.outward, 0.6).addScaledVector(this.lateral, 0.3);
        this.solve(leg, this.target, this.pole);
        const toe = this.bones.get((i === 0 ? "Left" : "Right") + "ToeBase");
        if (toe) {
          this.fingerTarget.copy(this.target).addScaledVector(this.outward,-0.22).addScaledVector(UP,0.1);
          this.aim(leg.end,toe,this.fingerTarget);
        }
      }
    } else if (state === "BALANCE" && p.balancer.active) {
      const balance = p.balancer.active;
      const rail = p.level.rails[balance.railIndex];
      for (let i = 0; i < 2; i++) {
        const chain = this.legs[i];
        if (!chain) continue;
        const stride = 0.8;
        const distance = balance.t * rail.length * balance.alongAlign;
        const offset = i * stride * 0.5;
        const cycle = (distance + offset) / stride;
        const phase = cycle - Math.floor(cycle);
        const swing = ease(phase, 0.5, 1);
        const footDistance = (Math.floor(cycle) * stride - offset + stride * swing + stride * 0.25) * balance.alongAlign;
        rail.curve.getPointAt(THREE.MathUtils.clamp(footDistance / rail.length, 0, 1), this.target);
        this.target.y += 0.13 + (p.horizontalSpeed > 0.1 && phase > 0.5 ? Math.sin((phase - 0.5) * Math.PI * 2) * 0.16 : 0);
        this.local(i === 0 ? 0.2 : -0.2, -0.1, 0.8, this.pole);
        this.solve(chain, this.target, this.pole);
      }
      for (let i = 0; i < 2; i++) {
        const chain = this.arms[i];
        if (!chain) continue;
        this.local(
          i === 0 ? 0.65 : -0.65,
          0.45 + balance.sway * (i === 0 ? 0.2 : -0.2),
          0,
          this.target,
        );
        this.local(i === 0 ? 0.5 : -0.5, 0.0, -0.4, this.pole);
        this.solve(chain, this.target, this.pole);
      }
    } else if (state === "RUN" && p.grounded) {
      // Ground adaptation preserves the clip's stride; only the planted foot is corrected.
      for (let i = 0; i < 2; i++) {
        const chain = this.legs[i];
        if (!chain) continue;
        chain.end.getWorldPosition(this.target);
        this.ray.origin.x = this.target.x;
        this.ray.origin.y = this.target.y + 0.3;
        this.ray.origin.z = this.target.z;
        const hit = p.physics.world.castRay(
          this.ray,
          0.65,
          true,
          undefined,
          undefined,
          p.collider,
          p.body,
        );
        if (!hit) continue;
        const ground = this.ray.origin.y - hit.timeOfImpact + 0.1;
        if (this.target.y - ground > 0.16) continue;
        this.target.y = ground;
        this.local(i === 0 ? 0.2 : -0.2, -0.2, 1, this.pole);
        this.solve(chain, this.target, this.pole);
      }
    }
  }
}
