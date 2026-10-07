"""
Body rotation of the flip clips over time. Mocap flips do not finish their
turn in the air: they land folded and stand up out of the last quarter. The
game turns a flip on its own clock, so PlayerAnimator maps flip progress to
clip time through this curve (progress u -> the time the clip has turned
u * 360 degrees) instead of stretching takeoff..touchdown.

  blender -b -P tools/blender/flip_turns.py -- public/models/motion

Adds "turn": [[time, degrees], ...] (from takeoff until upright, degrees
counted from the takeoff lean, monotonic) to markers.json.
"""
import bpy, sys, os, json, math

argv = sys.argv[sys.argv.index("--") + 1:]
src = argv[0]
CHARACTER = os.path.join(os.path.dirname(src.rstrip("/")), "mixamo", "character.fbx")
markers_path = os.path.join(src, "markers.json")
markers = json.load(open(markers_path))


def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    bpy.ops.import_scene.fbx(filepath=CHARACTER, automatic_bone_orientation=False)
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    before = set(scene.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    clip = next(o for o in scene.objects if o.type == "ARMATURE" and o not in before)
    action = clip.animation_data.action
    target = {b.name.split(":")[-1]: b.name for b in arm.pose.bones}
    for fc in action.fcurves:
        if fc.data_path.startswith('pose.bones["'):
            bone = fc.data_path.split('"')[1]
            short = bone.split(":")[-1]
            if short in target:
                fc.data_path = fc.data_path.replace(f'"{bone}"', f'"{target[short]}"')
    arm.animation_data_create()
    arm.animation_data.action = action
    if hasattr(action, "slots") and len(action.slots):
        arm.animation_data.action_slot = action.slots[0]
    return scene, arm, action


for name in ("flip-back", "flip-front"):
    m = markers[name]
    scene, arm, action = load(os.path.join(src, name + ".fbx"))
    fps = scene.render.fps / scene.render.fps_base
    bone = lambda n: next(b for b in arm.pose.bones if b.name.split(":")[-1] == n)
    hips, chest = bone("Hips"), bone("Spine2")
    start, end = (int(v) for v in action.frame_range)
    samples, prev, total = [], None, 0.0
    for f in range(start, end + 1):
        scene.frame_set(f)
        w = arm.matrix_world
        spine = (w @ chest.head) - (w @ hips.head)
        a = math.degrees(math.atan2(spine.y, spine.z))
        if prev is not None:
            d = (a - prev + 180) % 360 - 180
            total += d
        prev = a
        samples.append((f / fps, total))
    # Direction of the turn decides the sign; count from the takeoff lean.
    take = min(range(len(samples)), key=lambda i: abs(samples[i][0] - m["takeoff"]))
    sign = 1 if samples[-1][1] - samples[take][1] >= 0 else -1
    base = samples[take][1] * sign
    turn, best = [], 0.0
    for t, a in samples[take:]:
        deg = a * sign - base
        if deg < best:
            continue
        best = deg
        turn.append([round(t, 3), round(deg, 1)])
        if deg >= 359:
            break
    m["turn"] = turn
    print(name, "takeoff lean", round(samples[take][1], 1), "turned", turn[-1], "points", len(turn), flush=True)

json.dump(markers, open(markers_path, "w"), indent=1)
