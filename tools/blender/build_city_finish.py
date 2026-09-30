"""Bake reusable city PBR surfaces and a compact roof ventilation kit with Blender."""
import bpy, os, math, sys
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
TEX=os.path.join(ROOT,'public/textures/city');OUT=os.path.join(ROOT,'public/models/city')
os.makedirs(TEX,exist_ok=True);os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=8
s.render.bake.use_pass_direct=False;s.render.bake.use_pass_indirect=False;s.render.bake.use_pass_color=True
bpy.ops.mesh.primitive_plane_add(size=2);plane=bpy.context.object
for kind in ([] if '--kit-only' in sys.argv else ['plaster','asphalt','wood','metal']):
 m=bpy.data.materials.new(kind);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;n.clear()
 out=n.new('ShaderNodeOutputMaterial');bs=n.new('ShaderNodeBsdfPrincipled');l.new(bs.outputs['BSDF'],out.inputs['Surface'])
 uv=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(2,50,1) if kind=='wood' else ((4,90,1) if kind=='metal' else (1,1,1));l.new(uv.outputs['UV'],mapping.inputs[0])
 noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=8 if kind in ['wood','metal'] else 85;noise.inputs['Detail'].default_value=3;l.new(mapping.outputs[0],noise.inputs['Vector'])
 ramp=n.new('ShaderNodeValToRGB');lo,hi={'plaster':(.62,.91),'asphalt':(.40,.83),'wood':(.35,.90),'metal':(.60,.95)}[kind]
 ramp.color_ramp.elements[0].color=(lo,lo,lo,1);ramp.color_ramp.elements[1].color=(hi,hi,hi,1);l.new(noise.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs['Color'],bs.inputs['Base Color'])
 rough=n.new('ShaderNodeMapRange');rough.inputs['To Min'].default_value=.42 if kind=='metal' else .72;rough.inputs['To Max'].default_value=.72 if kind=='metal' else .98;l.new(noise.outputs['Fac'],rough.inputs[0]);l.new(rough.outputs[0],bs.inputs['Roughness'])
 bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.018;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs['Normal'],bs.inputs['Normal'])
 plane.data.materials.clear();plane.data.materials.append(m)
 for channel in ['color','normal','roughness']:
  img=bpy.data.images.new(kind+'-'+channel,width=512,height=512,alpha=False)
  if channel!='color':img.colorspace_settings.name='Non-Color'
  node=n.new('ShaderNodeTexImage');node.image=img;n.active=node
  bpy.ops.object.bake(type={'color':'DIFFUSE','normal':'NORMAL','roughness':'ROUGHNESS'}[channel],margin=8)
  img.filepath_raw=os.path.join(TEX,kind+'-'+channel+'.png');img.file_format='PNG';img.save();n.remove(node)
bpy.data.objects.remove(plane,do_unlink=True)
def material(name,color,metal,rough):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;return m
steel=material('Galvanised housing',(.37,.43,.43),.65,.5);dark=material('Vent recesses',(.045,.06,.06),.45,.72);bolts=material('Steel fasteners',(.58,.6,.55),.8,.32)
def cube(name,pos,size,mat,bevel=.015):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(pos[0],-pos[2],pos[1]));o=bpy.context.object;o.name=name;o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if bevel:
  mod=o.modifiers.new('Edge bevel','BEVEL');mod.width=bevel;mod.segments=2;bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.materials.append(mat);return o
cube('Base',(0,.04,0),(2.2,.08,1.6),dark)
cube('Housing',(0,.31,0),(2.14,.5,1.54),steel,.045)
for side in [-1,1]:
 cube('Intake recess',(0,.31,side*.78),(1.94,.36,.025),dark)
 for k in range(10):cube('Louvre',(-.85+k*.19,.31,side*.79),(.035,.32,.02),steel,.005)
for x in [-.55,.55]:
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.37,depth=.015,location=(x,0,.572));o=bpy.context.object;o.data.materials.append(dark)
 bpy.ops.mesh.primitive_torus_add(major_radius=.35,minor_radius=.012,major_segments=24,minor_segments=5,location=(x,0,.59));bpy.context.object.data.materials.append(bolts)
 for k in range(5):
  a=k*math.tau/5;blade=cube('Fan blade',(x+math.cos(a)*.15,.582,math.sin(a)*.15),(.3,.012,.065),steel,.008);blade.rotation_euler.z=-a
 for dx in [-.23,0,.23]:cube('Fan grille',(x+dx,.599,0),(.012,.012,.53),bolts,.003)
for x in [-.99,.99]:
 for z in [-.66,.66]:cube('Fixing',(x,.575,z),(.065,.035,.065),bolts,.009)
for mat in [steel,dark,bolts]:
 objects=[o for o in list(bpy.data.objects) if o.type=='MESH' and o.data.materials[0]==mat]
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();bpy.context.object.name='RoofVent_'+mat.name
 bpy.context.scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'roof-vent.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'roof-vent.glb'),export_format='GLB',export_yup=True,export_animations=False)
print('CITY ASSETS READY')
