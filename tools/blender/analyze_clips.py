"""
Contact timing of Mixamo clips on the game character: when the feet leave
the ground, when they touch down again, and when the hips sit lowest.
PlayerAnimator uses these markers to lock a clip's takeoff and touchdown
frames onto the physical ones (phase sync instead of playing clips through).

  blender -b -P tools/blender/analyze_clips.py -- <fbx dir> <out.json> [name-filter]
"""
import bpy, sys, os, json

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
only = argv[2].split(",") if len(argv) > 2 else [""]
CHARACTER = os.path.join(os.path.dirname(src.rstrip("/")), "mixamo", "character.fbx")
if not os.path.exists(CHARACTER):
    CHARACTER = os.path.join(src, "character.fbx")


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


def bone(arm, short):
    return next(b for b in arm.pose.bones if b.name.split(":")[-1] == short)


result = {}
if os.path.exists(out):
    result = json.load(open(out))
for file in sorted(os.listdir(src)):
    if not file.endswith(".fbx") or not any(o in file for o in only) or file == "character.fbx":
        continue
    name = file[:-4]
    try:
        scene, arm, action = load(os.path.join(src, file))
        fps = scene.render.fps / scene.render.fps_base
        start, end = (int(v) for v in action.frame_range)
        feet = [bone(arm, n) for n in ("LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot")]
        hips = bone(arm, "Hips")
        lows, hipsY = [], []
        for f in range(start, end + 1):
            scene.frame_set(f)
            lows.append(min((arm.matrix_world @ b.head).z for b in feet))
            hipsY.append((arm.matrix_world @ hips.head).z)
        ground = min(lows)
        air = [z > ground + 0.12 for z in lows]
        takeoff = next((i for i in range(len(air) - 2) if all(air[i:i + 3])), None)
        # Grounded only once the feet stay down for four frames: inverted in
        # a flip they dip briefly, which is no touchdown.
        touchdown = next((i for i in range((takeoff or 0) + 1, len(air) - 3) if not any(air[i:i + 4])), None) if takeoff is not None else None
        low = None
        if touchdown is not None:
            seg = hipsY[touchdown:]
            low = touchdown + seg.index(min(seg))
        apex = None
        if takeoff is not None and touchdown is not None:
            seg = hipsY[takeoff:touchdown]
            apex = takeoff + seg.index(max(seg)) if seg else None
        t = lambda i: None if i is None else round(i / fps, 3)
        result[name] = {"duration": round((end - start) / fps, 3), "fps": fps, "takeoff": t(takeoff), "apex": t(apex), "touchdown": t(touchdown), "lowest": t(low),
                        "hipsRange": [round(min(hipsY), 3), round(max(hipsY), 3)], "airborne": round(max(lows) - ground, 3)}
        print("analyzed", name, result[name], flush=True)
    except Exception as e:
        print("failed", name, e, flush=True)
json.dump(result, open(out, "w"), indent=1)
