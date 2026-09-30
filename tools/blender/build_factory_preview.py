"""Reproducible Blender kit + baked PBR surfaces for the mill graphics trial."""
import bpy, math, os, sys
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=os.path.join(ROOT,'public/models/factory-preview')
TEX=os.path.join(ROOT,'public/textures/factory-preview')
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8
scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
# Plane UVs bake texture structure, not scene lighting, so the kit stays reusable.
bpy.ops.mesh.primitive_plane_add(size=2);plane=bpy.context.object
for kind in ([] if '--kit-only' in sys.argv else ['brick','concrete']):
    mat=bpy.data.materials.new(kind);mat.use_nodes=True;n=mat.node_tree.nodes;l=mat.node_tree.links;n.clear()
    out=n.new('ShaderNodeOutputMaterial');bs=n.new('ShaderNodeBsdfPrincipled');l.new(bs.outputs['BSDF'],out.inputs['Surface'])
    uv=n.new('ShaderNodeTexCoord');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=95;noise.inputs['Detail'].default_value=3;l.new(uv.outputs['UV'],noise.inputs['Vector'])
    if kind=='brick':
        tex=n.new('ShaderNodeTexBrick');l.new(uv.outputs['UV'],tex.inputs['Vector'])
        tex.inputs['Scale'].default_value=6;tex.inputs['Mortar Size'].default_value=.022
        tex.inputs['Brick Width'].default_value=.6;tex.inputs['Row Height'].default_value=.25
        tex.inputs['Color1'].default_value=(.30,.115,.067,1);tex.inputs['Color2'].default_value=(.13,.055,.031,1);tex.inputs['Mortar'].default_value=(.115,.12,.10,1)
        color=tex.outputs['Color'];height=tex.outputs['Fac']
    else:
        tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=9;tex.inputs['Detail'].default_value=5;l.new(uv.outputs['UV'],tex.inputs['Vector'])
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(.12,.14,.12,1);ramp.color_ramp.elements[1].color=(.33,.34,.28,1);l.new(tex.outputs['Fac'],ramp.inputs[0]);color=ramp.outputs['Color'];height=noise.outputs['Fac']
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.32;bump.inputs['Distance'].default_value=.025;bump.invert=kind=='brick';l.new(height,bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
    l.new(color,bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.86
    plane.data.materials.clear();plane.data.materials.append(mat)
    for channel in ['color','normal','roughness']:
        img=bpy.data.images.new(f'{kind}-{channel}',width=512,height=512,alpha=False)
        if channel!='color':img.colorspace_settings.name='Non-Color'
        node=n.new('ShaderNodeTexImage');node.image=img;n.active=node
        bpy.ops.object.bake(type={'color':'DIFFUSE','normal':'NORMAL','roughness':'ROUGHNESS'}[channel],margin=8)
        img.filepath_raw=os.path.join(TEX,f'{kind}-{channel}.png');img.file_format='PNG';img.save();n.remove(node)
bpy.data.objects.remove(plane,do_unlink=True)
# Compact kit: bevelled edges, machined housings, bolts, valve and inspection glass.
def material(name,color,metal=0,rough=.8,emission=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emission
    return m
steel=material('Aged painted iron',(.065,.095,.082),.65,.56)
rust=material('Oxidised fasteners',(.20,.085,.035),.45,.88)
brass=material('Service brass',(.31,.24,.10),.7,.45)
glass=material('Gauge glass',(.16,.23,.23),.3,.2)
light=material('Warm porcelain lamp',(.82,.65,.36),.1,.4,2)
objects=[]
def coord(p):return(p[0],-p[2],p[1])
def cube(name,pos,size,mat,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=coord(pos));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Edge highlights','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
    o.data.materials.append(mat);objects.append(o);return o
# Chassis fits the existing collision bounds: 2.2 x 1.3 x 2 m.
cube('plinth',(0,.08,0),(2.2,.16,2),steel)
cube('cast housing',(-.12,.61,0),(1.85,1.05,1.75),steel,.08)
cube('inspection cover',(0,.69,.90),(1.12,.74,.10),rust,.04)
for x in [-.46,.46]:
    for y in [.42,.96]:cube('bolt',(x,y,.965),(.075,.075,.035),brass,.015)
for i in range(9):cube('cooling fin',(-.76+i*.17,.69,-.90),(.055,.7,.075),steel,.012)
cube('instrument panel',(.51,1.15,.2),(.65,.20,.55),brass,.035)
cube('dial',(.51,1.265,.2),(.44,.025,.36),glass,.02)
for x in [-.88,.88]:
    for z in [-.78,.78]:cube('anchor',(x,.19,z),(.14,.08,.14),rust,.02)
# Wheel facing the front, still entirely within the 1.3 m high machine envelope.
bpy.ops.mesh.primitive_torus_add(major_radius=.22,minor_radius=.025,major_segments=20,minor_segments=6,location=coord((-.48,.75,.99)),rotation=(math.pi/2,0,0));o=bpy.context.object;o.name='valve wheel';o.data.materials.append(brass);objects.append(o)
for x in [-.48]:cube('valve spoke',(x,.75,.99),(.42,.035,.035),brass,.01);cube('valve spoke',(x,.75,.99),(.035,.42,.035),brass,.01)
# Merge by material: five reusable meshes, rather than one draw per small bolt.
for mat in [steel,rust,brass,glass]:
    group=[o for o in list(bpy.data.objects) if o.type=='MESH' and o.data.materials[0]==mat]
    bpy.ops.object.select_all(action='DESELECT')
    for o in group:o.select_set(True)
    bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join();o=bpy.context.object;o.name='MillMachine_'+mat.name
    bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'mill-kit.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'mill-kit.glb'),export_format='GLB',export_yup=True,export_materials='EXPORT',export_animations=False)
print('FACTORY PREVIEW ASSETS READY')
