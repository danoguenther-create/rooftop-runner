"""
Contact sheets for Mixamo clips: every clip is played on a mannequin built
from its own skeleton and rendered from the side at eight phases.

  blender -b -P tools/blender/review_clips.py -- public/models/incoming artifacts/clips [name-filter]

Writes <out>/<clip>.png (one strip per clip, 8 frames).
"""
import bpy, sys, os, math
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
only = argv[2] if len(argv) > 2 else ""
os.makedirs(out, exist_ok=True)
PHASES = 8
SIZE = 260


def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "OBJECT"
    scene.render.resolution_x = scene.render.resolution_y = SIZE
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (0.82, 0.85, 0.88)
    return scene


def mannequin(arm):
    """Capsule per bone (no fingers), parented to the bone in rest pose."""
    arm.data.pose_position = "REST"
    bpy.context.view_layer.update()
    for bone in arm.data.bones:
        n = bone.name.split(":")[-1]
        if any(f in n for f in ("Thumb", "Index", "Middle", "Ring", "Pinky", "End", "Toe_End", "HeadTop")):
            continue
        length = bone.length * arm.scale.x
        if length < 0.01:
            continue
        r = 0.055 if any(k in n for k in ("Spine", "Hips")) else 0.035
        bpy.ops.mesh.primitive_cylinder_add(radius=r / arm.scale.x, depth=bone.length, vertices=10)
        ob = bpy.context.object
        ob.color = (0.85, 0.35, 0.25, 1) if "Left" in n else (0.25, 0.45, 0.85, 1) if "Right" in n else (0.9, 0.9, 0.9, 1)
        world = arm.matrix_world @ bone.matrix_local @ Matrix.Translation((0, bone.length / 2, 0)) @ Matrix.Rotation(math.radians(-90), 4, "X")
        ob.parent = arm
        ob.parent_type = "BONE"
        ob.parent_bone = bone.name
        bpy.context.view_layer.update()
        ob.matrix_world = world
        if n == "Head":
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.11 / arm.scale.x)
            hd = bpy.context.object
            hd.color = (0.95, 0.8, 0.6, 1)
            hd.parent = arm
            hd.parent_type = "BONE"
            hd.parent_bone = bone.name
            bpy.context.view_layer.update()
            hd.matrix_world = arm.matrix_world @ bone.matrix_local @ Matrix.Translation((0, bone.length, 0))
    arm.data.pose_position = "POSE"


CHARACTER = os.path.join(os.path.dirname(src.rstrip("/")), "mixamo", "character.fbx")


def render_clip(path, name):
    scene = clean()
    scene.display.shading.color_type = "MATERIAL"
    # The game's own character, driven by the clip's action (bone names are
    # matched without Mixamo's export prefix, as AssetLoader does).
    bpy.ops.import_scene.fbx(filepath=CHARACTER, automatic_bone_orientation=False)
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    before = set(scene.objects)
    bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=False)
    clip = next(o for o in scene.objects if o.type == "ARMATURE" and o not in before)
    action = clip.animation_data.action if clip.animation_data else None
    if not action:
        return False
    target = {b.name.split(":")[-1]: b.name for b in arm.pose.bones}
    for fc in action.fcurves:
        if fc.data_path.startswith('pose.bones["'):
            bone = fc.data_path.split('"')[1]
            short = bone.split(":")[-1]
            if short in target:
                fc.data_path = fc.data_path.replace(f'"{bone}"', f'"{target[short]}"')
    arm.animation_data_create()
    arm.animation_data.action = action
    # Blender 4.4+: an action only drives an object through one of its slots.
    if hasattr(action, "slots") and len(action.slots):
        arm.animation_data.action_slot = action.slots[0]
    for o in [o for o in scene.objects if o not in before or o is clip]:
        if o is not arm and (o is clip or o.parent is clip):
            bpy.data.objects.remove(o, do_unlink=True)
    start, end = (int(v) for v in action.frame_range)
    # Ground grid for reading height and travel.
    bpy.ops.mesh.primitive_plane_add(size=12)
    bpy.context.object.color = (0.55, 0.58, 0.6, 1)
    hips = next(b for b in arm.pose.bones if b.name.endswith("Hips"))
    cam_data = bpy.data.cameras.new("c")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 3.2
    cam = bpy.data.objects.new("c", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    files = []
    for k in range(PHASES):
        f = start + round((end - start) * k / (PHASES - 1))
        scene.frame_set(f)
        h = arm.matrix_world @ hips.head
        # Side view (character faces +Y in Mixamo exports): camera on +X.
        cam.location = Vector((h.x + 6, h.y, max(0.9, h.z)))
        cam.rotation_euler = (math.radians(90), 0, math.radians(90))
        scene.render.filepath = os.path.join(out, f".{name}-{k}.png")
        bpy.ops.render.render(write_still=True)
        files.append(scene.render.filepath)
    with open(os.path.join(out, f".{name}.frames"), "w") as fh:
        fh.write(f"{start} {end} {action.frame_range[1] - action.frame_range[0]}\n" + "\n".join(files))
    return True


for file in sorted(os.listdir(src)):
    if not file.endswith(".fbx") or only not in file:
        continue
    name = file[:-4]
    try:
        ok = render_clip(os.path.join(src, file), name)
        print("rendered" if ok else "no action", name, flush=True)
    except Exception as e:  # keep going through the batch
        print("failed", name, e, flush=True)
