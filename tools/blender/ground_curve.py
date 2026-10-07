"""
Ground contact curve of the landing clips ("hipsY": "keep"). The game
removes the clips' own hip translation (travel belongs to the physics
capsule), so their crouch has to be rebuilt: how far the hips sit above the
lowest foot in each frame, measured on the game's own skeleton. That height
depends on joint rotations only, not on the exporting character's size.

  blender -b -P tools/blender/ground_curve.py -- public/models/motion

Adds "ground": [[time, metres]] per frame plus "hipsRest" and "footRest"
(hip and lowest foot height in the rest pose) to markers.json. AssetLoader
places the hips so the lowest foot stays where it rests in every other clip.
"""
import bpy, sys, os, json

argv = sys.argv[sys.argv.index("--") + 1:]
src = argv[0]
CHARACTER = os.path.join(os.path.dirname(src.rstrip("/")), "mixamo", "character.fbx")
markers_path = os.path.join(src, "markers.json")
markers = json.load(open(markers_path))
FEET = ("LeftToeBase", "RightToeBase", "LeftFoot", "RightFoot")


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


def height(arm, hips, feet):
    w = arm.matrix_world
    return (w @ hips.head).z - min((w @ b.head).z for b in feet)


for name, m in markers.items():
    if m.get("hipsY") != "keep":
        continue
    scene, arm, action = load(os.path.join(src, name + ".fbx"))
    fps = scene.render.fps / scene.render.fps_base
    bone = lambda n: next(b for b in arm.pose.bones if b.name.split(":")[-1] == n)
    hips, feet = bone("Hips"), [bone(n) for n in FEET]
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    m["hipsRest"] = round((arm.matrix_world @ hips.head).z, 4)
    m["footRest"] = round(min((arm.matrix_world @ b.head).z for b in feet), 4)
    m.pop("groundRest", None)
    arm.data.pose_position = "POSE"
    start, end = (int(v) for v in action.frame_range)
    curve = []
    for f in range(start, end + 1):
        scene.frame_set(f)
        curve.append([round(f / fps, 3), round(height(arm, hips, feet), 4)])
    m["ground"] = curve
    print(name, "hips", m["hipsRest"], "foot", m["footRest"], "min", min(c[1] for c in curve), "end", curve[-1][1], flush=True)

json.dump(markers, open(markers_path, "w"), indent=1)
