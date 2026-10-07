import * as THREE from "three";
import { visualTrial } from "../level/FactoryPreview";
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
  private diveWasActive = false;
  private diveRolling = false;
  private diveBlendAge = 1;
  private readonly identity = new THREE.Quaternion();
  private previousLanding = "RUN";
  private handFace: unknown = null;
  private handKey = "";
  private handAnchor = [new THREE.Vector3(), new THREE.Vector3()];
  private handFrom = [new THREE.Vector3(), new THREE.Vector3()];
  private handGoal = [new THREE.Vector3(), new THREE.Vector3()];
  private handOut = [new THREE.Vector3(), new THREE.Vector3()];
  private handStep = [-1, -1];
  private landing: { age: number; depth: number; duration: number; precision: boolean; running: boolean; feet: THREE.Vector3[] } | null = null;
  private runLean = 0;
  private turnLean = 0;
  private previousYaw = 0;
  private bones = new Map<string, THREE.Bone>();
  private sampled: {
    bone: THREE.Bone;
    rotation: THREE.Quaternion;
    position: THREE.Vector3;
    lastRotation: THREE.Quaternion;
    lastPosition: THREE.Vector3;
    rotationOffset: THREE.Quaternion;
    positionOffset: THREE.Vector3;
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
      position: bone.position.clone(),
      lastRotation: bone.quaternion.clone(),
      lastPosition: bone.position.clone(),
      rotationOffset: new THREE.Quaternion(),
      positionOffset: new THREE.Vector3(),
      scale: bone.scale.clone(),
    }));
    for (const side of ["Left", "Right"]) {
      this.arms.push(this.chain(side + "Arm", side + "ForeArm", side + "Hand"));
      this.legs.push(this.chain(side + "UpLeg", side + "Leg", side + "Foot"));
    }
  }
  /** Classify the touchdown that just happened (see update). */
  private beginLanding() {
    const p = this.p, fall = p.lastFallHeight, speed = p.horizontalSpeed;
    if (fall < 0.15) return;
    const at = p.body.translation(), feet = at.y - 0.925;
    // Width of the surface underfoot: narrow tops make a precision landing.
    let narrow = Infinity;
    for (const f of p.level.topFaces) {
      if (Math.abs(f.y - feet) > 0.3) continue;
      const dx = at.x - f.cx, dz = at.z - f.cz, c = Math.cos(f.rotY), s = Math.sin(f.rotY);
      if (Math.abs(dx * c - dz * s) > f.halfX + 0.05 || Math.abs(dx * s + dz * c) > f.halfZ + 0.05) continue;
      narrow = Math.min(narrow, 2 * Math.min(f.halfX, f.halfZ));
    }
    const precision = narrow <= 0.9 || (speed < 2.5 && fall > 0.5);
    const running = !precision && speed > 5;
    const depth = precision ? THREE.MathUtils.clamp(0.16 + fall * 0.05, 0.16, 0.3) : THREE.MathUtils.clamp(0.04 + fall * 0.06, 0.04, running ? 0.14 : 0.24);
    const duration = precision ? 0.5 : THREE.MathUtils.clamp(0.22 + fall * 0.06, 0.22, 0.42) * (running ? 0.75 : 1);
    const anchors = this.legs.map((leg) => (leg ? leg.end.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3()));
    if (precision) {
      // Feet land together, a hand's width apart.
      const mid = anchors[0].clone().add(anchors[1]).multiplyScalar(0.5);
      for (const a of anchors) a.lerp(mid, 0.45).setY(feet + 0.09);
    }
    this.landing = { age: 0, depth, duration, precision, running, feet: anchors };
  }

  private applyLanding(dt: number) {
    const l = this.landing!, p = this.p;
    l.age += dt;
    if (l.age >= l.duration) { this.landing = null; return; }
    // Fast compression, slow rise: the knees take the load, then extend.
    const down = l.duration * 0.28;
    const c = l.age < down ? Math.sin((l.age / down) * Math.PI / 2) : 0.5 + 0.5 * Math.cos(((l.age - down) / (l.duration - down)) * Math.PI);
    // A motion-capture landing clip carries the crouch itself; only plant the feet.
    const clip = p.animationName.startsWith("land-");
    if (!clip) this.model.position.y -= l.depth * c;
    const spine = clip ? null : this.bones.get("Spine");
    if (spine) spine.rotateX(c * (l.precision ? 0.5 : l.running ? 0.18 : 0.3) * Math.min(1, l.depth / 0.2 + 0.3));
    p.mesh.updateMatrixWorld(true);
    // Running landings keep the clip's stride (feet follow it); standing and
    // precision landings stay planted where they touched down.
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      if (!leg) continue;
      if (l.running) leg.end.getWorldPosition(this.target);
      else this.target.copy(l.feet[i]);
      this.local(i === 0 ? 0.25 : -0.25, -0.35, 0.6, this.pole);
      this.solve(leg, this.target, this.pole);
    }
    if (l.precision && !clip) {
      // Arms forward for balance, swinging back as the legs extend.
      for (let i = 0; i < 2; i++) {
        const arm = this.arms[i];
        if (!arm) continue;
        arm.end.getWorldPosition(this.endpoint);
        this.local(i === 0 ? 0.24 : -0.24, 0.2 - 0.25 * c, 0.45, this.target);
        this.target.lerp(this.endpoint, 1 - c);
        this.local(i === 0 ? 0.6 : -0.6, -0.1, -0.3, this.pole);
        this.solve(arm, this.target, this.pole);
      }
    }
  }

  private reachForLanding() {
    const p = this.p, at = p.body.translation(), vy = -p.velocity.y;
    this.ray.origin.x = at.x + p.velocity.x * 0.12;
    this.ray.origin.y = at.y;
    this.ray.origin.z = at.z + p.velocity.z * 0.12;
    const hit = p.physics.world.castRay(this.ray, 4, true, undefined, undefined, p.collider, p.body);
    if (!hit) return;
    const gap = hit.timeOfImpact - 0.925, tti = gap / vy;
    if (tti > 0.28 || tti < 0) return;
    const w = 1 - tti / 0.28, ground = at.y - hit.timeOfImpact;
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      if (!leg) continue;
      leg.end.getWorldPosition(this.endpoint);
      // Feet slightly ahead of the hips and close together, knees bent.
      this.local(i === 0 ? 0.12 : -0.12, 0, 0.18, this.target);
      this.target.x += p.velocity.x * tti;
      this.target.z += p.velocity.z * tti;
      this.target.y = Math.max(ground + 0.12, this.endpoint.y);
      this.target.lerp(this.endpoint, 1 - w * 0.8);
      this.local(i === 0 ? 0.2 : -0.2, -0.3, 0.8, this.pole);
      this.solve(leg, this.target, this.pole);
    }
    // A motion-capture jump brings its own arms.
    for (let i = 0; i < (p.animationName.startsWith("jump-") ? 0 : 2); i++) {
      const arm = this.arms[i];
      if (!arm) continue;
      arm.end.getWorldPosition(this.endpoint);
      this.local(i === 0 ? 0.26 : -0.26, 0.3, 0.42, this.target);
      this.target.lerp(this.endpoint, 1 - w * 0.6);
      this.local(i === 0 ? 0.6 : -0.6, -0.1, -0.3, this.pole);
      this.solve(arm, this.target, this.pole);
    }
  }

  restore(): void {
    for (const s of this.sampled) {
      s.bone.quaternion.copy(s.rotation);
      s.bone.position.copy(s.position);
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
  /**
   * Hand over hand while hanging: each hand keeps its grip on the edge until
   * the body has moved 14 cm past it, then lifts and re-grips ahead, never
   * both at once. Without this both hands slid along with the body.
   */
  private shimmyHands(dt: number): THREE.Vector3[] {
    const grab = this.p.climb.grab!;
    // Same left/right resolution as hands(): index 0 is the rig's left arm.
    if (this.arms[0] && this.arms[1]) {
      this.arms[0].upper.getWorldPosition(this.a);
      this.arms[1].upper.getWorldPosition(this.b);
      if (this.a.sub(this.b).dot(this.lateral) < 0) this.lateral.negate();
    }
    const desired = [0, 1].map((i) => this.edge.clone().addScaledVector(this.lateral, (i === 0 ? 1 : -1) * 0.21));
    // A new edge, side or corner, or a grip left far behind: grip afresh.
    const key = `${grab.axis}${grab.sign}`;
    if (this.handFace !== grab.face || this.handKey !== key || this.handAnchor.some((h, i) => h.distanceTo(desired[i]) > 0.4)) {
      this.handFace = grab.face;
      this.handKey = key;
      for (let i = 0; i < 2; i++) { this.handAnchor[i].copy(desired[i]); this.handStep[i] = -1; }
    }
    for (let i = 0; i < 2; i++) {
      const other = 1 - i;
      if (this.handStep[i] >= 0) {
        this.handStep[i] += dt / 0.16;
        if (this.handStep[i] >= 1) { this.handStep[i] = -1; this.handAnchor[i].copy(this.handGoal[i]); }
      } else if (this.handStep[other] < 0 && this.handAnchor[i].distanceTo(desired[i]) > 0.14) {
        // Re-grip a little ahead in the direction of travel.
        this.handFrom[i].copy(this.handAnchor[i]);
        this.handGoal[i].copy(desired[i]).addScaledVector(this.a.copy(desired[i]).sub(this.handAnchor[i]).normalize(), 0.07);
        this.handStep[i] = 0;
      }
    }
    return [0, 1].map((i) => {
      const out = this.handOut[i];
      if (this.handStep[i] < 0) return out.copy(this.handAnchor[i]);
      const u = this.handStep[i];
      out.copy(this.handFrom[i]).lerp(this.handGoal[i], ease(u, 0, 1));
      out.y += Math.sin(Math.PI * u) * 0.06;
      out.addScaledVector(this.outward, Math.sin(Math.PI * u) * 0.04);
      return out;
    });
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
    targets?: THREE.Vector3[],
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
        if (targets) this.target.copy(targets[i]);
        else this.target
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
      if (targets) this.target.copy(targets[i]);
      else this.target.copy(center).addScaledVector(lateral, side * 0.21);
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
      s.position.copy(s.bone.position);
      s.scale.copy(s.bone.scale);
    }
    const p = this.p,
      state = p.fsm.current;
    this.stride += p.horizontalSpeed * _dt;
    this.model.rotation.x=0;
    this.activeHands = 0;
    this.handErrors.fill(0);
    // Keep the imported character's identity, with less exaggerated head proportions.
    const head = this.bones.get("Head");
    if (head) head.scale.setScalar(0.82);
    if (state === "BALANCE") this.model.position.y -= 0.12;
    p.mesh.updateMatrixWorld(true);
    if(visualTrial){
      const locomotion=state==='RUN' && ['run','sprint','idle'].includes(p.animationName);
      const yawDelta=THREE.MathUtils.euclideanModulo(p.mesh.rotation.y-this.previousYaw+Math.PI,Math.PI*2)-Math.PI;
      this.previousYaw=p.mesh.rotation.y;
      const mix=1-Math.exp(-10*_dt);
      this.runLean=THREE.MathUtils.lerp(this.runLean,locomotion?THREE.MathUtils.clamp(p.horizontalSpeed/9,0,1)*.10:0,mix);
      this.turnLean=THREE.MathUtils.lerp(this.turnLean,locomotion?THREE.MathUtils.clamp(yawDelta/Math.max(_dt,.001)*-.025,-.08,.08):0,mix);
      if(locomotion){
        const spine=this.bones.get('Spine');
        if(spine){spine.rotateX(this.runLean);spine.rotateZ(this.turnLean);}
      }
      // Landing profiles: depth, duration and body shape follow fall height,
      // run-in speed and the width of what was landed on.
      if(state==='RUN'&&this.previousLanding==='AIR'&&!['sprint-roll','roll'].includes(p.animationName))this.beginLanding();
      this.previousLanding=state;
      if(this.landing&&(state!=='RUN'||['sprint-roll','roll'].includes(p.animationName)))this.landing=null;
      if(this.landing)this.applyLanding(_dt);
      // Spotting the landing: shortly before touchdown the feet reach for the
      // predicted contact and the arms come forward, like a precision jump.
      if(state==='AIR'&&!p.diveJumpActive&&!p.airTricks.active&&!p.climb.isWallClimbing&&p.velocity.y< -1.5)this.reachForLanding();
    }
    if(state === "AIR" && p.diveJumpActive){
      const weight=ease(p.diveJumpTime,0,.14);
      const tuck=ease(-p.velocity.y,0,7);
      const pitch=THREE.MathUtils.clamp(Math.PI/2-Math.atan2(p.velocity.y,Math.max(p.horizontalSpeed,.1)),.25,2.45);
      const hips=this.bones.get('Hips');
      // Rotate the skeleton around its pelvis, not the capsule/root. The same
      // pivot survives touchdown and avoids snapping the whole model upright.
      if(hips)hips.rotateX(pitch*weight);
      p.mesh.updateMatrixWorld(true);
      for(let i=0;i<2;i++){
        const side=i===0?1:-1,arm=this.arms[i],leg=this.legs[i];
        if(arm){
          arm.end.getWorldPosition(this.endpoint);
          this.local(side*(.25-.04*tuck),.1+Math.cos(pitch)*.9,Math.sin(pitch)*.9,this.target);
          this.target.lerp(this.endpoint,1-weight);
          this.local(side*.48,-.35*tuck,.5,this.pole);this.solve(arm,this.target,this.pole);
        }
        if(leg){
          leg.end.getWorldPosition(this.endpoint);
          this.local(side*.16,-.18-Math.cos(pitch)*.55,-Math.sin(pitch)*.55+.15*tuck,this.target);
          this.target.lerp(this.endpoint,1-weight);
          this.local(side*.25,-.55,.28,this.pole);this.solve(leg,this.target,this.pole);
        }
      }
    } else if (state === "AIR" && p.airTricks.tuckWeight > 0) {
      // Over a motion-capture flip only half strength: the clip keeps its
      // arms and timing, the knees just come in tighter.
      const weight = p.airTricks.tuckWeight * (p.airTricks.clipShare > 0 ? 0.6 : 1);
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
      const transfer=p.climb.transfer;
      // Push off, release in flight, reach for the destination, then catch.
      const flight=transfer&&!transfer.corner&&(!transfer.bodyPoints||transfer.detour) ? Math.sin(Math.PI*transfer.t) : 0;
      const dropGrip=transfer?.bodyPoints&&!transfer.detour ? ease(transfer.t,.45,.85) : 1;
      const grip=release*dropGrip*(1-ease(flight,.35,.8));
      if(grip>0&&t<0&&!transfer)this.hands(this.edge,this.lateral,grip,true,this.shimmyHands(_dt));
      else{this.handFace=null;if(grip>0)this.hands(this.edge,this.lateral,grip);}
      if(flight>.15){
        for(let i=0;i<2;i++){
          const arm=this.arms[i];if(!arm)continue;
          arm.end.getWorldPosition(this.endpoint);
          this.target.copy(this.edge).addScaledVector(this.lateral,i===0?.23:-.23);
          this.target.y-=.2*flight;this.target.lerp(this.endpoint,1-flight*.7);
          this.local(i===0?.45:-.45,.15,.6,this.pole);this.solve(arm,this.target,this.pole);
        }
      }
      // Feet press against the wall, then step over the ledge in sequence.
      for (let i = 0; i < 2; i++) {
        const chain = this.legs[i];
        if (!chain) continue;
        if(!p.climb.braced&&t<0){
          this.local(i===0?.17:-.17,-.8,.08+(p.climb.transfer?.15:0),this.target);
          this.local(i===0?.3:-.3,-.25,.65,this.pole);this.solve(chain,this.target,this.pole);continue;
        }
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
        if(t<0){
          const stride=Math.sin(p.climb.shimmyPhase*2+i*Math.PI);
          this.target.y+=.1*stride+.3*flight;
          this.target.addScaledVector(this.outward,.08*Math.max(0,stride)+.18*flight);
        }
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
    } else if (state === "VAULT" && p.activeVault?.kind==='slide') {
      const t=p.vaultProgress,blend=ease(t,0,.23)*(1-ease(t,.72,1));
      this.model.rotation.x=-1.2*blend;this.model.position.y+=.6*blend;p.mesh.updateMatrixWorld(true);
      for(let i=0;i<2;i++){
        const side=i===0?1:-1;
        const leg=this.legs[i];if(leg){this.local(side*.17,-.33,.65+(i===0?.15:0),this.target);this.local(side*.3,.1,.65,this.pole);leg.end.getWorldPosition(this.endpoint);this.target.lerp(this.endpoint,1-blend);this.solve(leg,this.target,this.pole);}
        const arm=this.arms[i];if(arm){this.local(side*.4,-.2,-.35,this.target);this.local(side*.6,.15,-.1,this.pole);arm.end.getWorldPosition(this.endpoint);this.target.lerp(this.endpoint,1-blend);this.solve(arm,this.target,this.pole);}
      }
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
      if (contact > 0 && plan.kind!=='drop') this.hands(this.edge, this.lateral, contact, plan.kind==='reach');
      for (let i = 0; i < 2; i++) {
        const chain = this.legs[i];
        if (!chain) continue;
        chain.end.getWorldPosition(this.endpoint);
        this.local((i === 0 ? 0.18 : -0.18) + (plan.kind==='reach'?0:(i === 0 ? 0.72 : 0.6)) * tuck,
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
    } else if (state === "RUN" && p.grounded && !["sprint-roll","roll"].includes(p.animationName) && !(this.landing && !this.landing.running)) {
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
    const rolling=['sprint-roll','roll'].includes(p.animationName);
    const touchdown=this.diveWasActive&&!p.diveJumpActive&&state==='RUN'&&rolling;
    const runOut=this.diveRolling&&!rolling&&state==='RUN';
    if(touchdown||runOut){
      this.diveBlendAge=0;
      for(const pose of this.sampled){
        pose.rotationOffset.copy(pose.bone.quaternion).invert().premultiply(pose.lastRotation);
        pose.positionOffset.copy(pose.lastPosition).sub(pose.bone.position);
      }
    }
    if(p.diveJumpActive&&!this.diveWasActive)this.diveBlendAge=1;
    if(state!=='RUN'&&!p.diveJumpActive)this.diveBlendAge=1;
    if(this.diveBlendAge<.14){
      const decay=1-ease(this.diveBlendAge,0,.14);
      for(const pose of this.sampled){
        this.q.copy(this.identity).slerp(pose.rotationOffset,decay);
        pose.bone.quaternion.premultiply(this.q);
        pose.bone.position.addScaledVector(pose.positionOffset,decay);
      }
      this.diveBlendAge+=_dt;
    }
    this.diveWasActive=p.diveJumpActive;
    this.diveRolling=touchdown||(this.diveRolling&&rolling&&state==='RUN');
    for(const pose of this.sampled){
      pose.lastRotation.copy(pose.bone.quaternion);
      pose.lastPosition.copy(pose.bone.position);
    }
    p.mesh.updateMatrixWorld(true);
  }
}
