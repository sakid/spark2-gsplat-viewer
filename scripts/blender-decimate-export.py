import argparse
import sys
import time
import os

import bpy


def parse_args(argv):
    parser = argparse.ArgumentParser(
        prog="blender-decimate-export",
        add_help=True,
        description="Import OBJ, decimate to target triangles, export GLB.",
    )
    parser.add_argument("--input", required=True, help="Input .obj path")
    parser.add_argument("--output", required=True, help="Output .glb path")
    parser.add_argument(
        "--target-triangles",
        type=int,
        default=500_000,
        help="Target triangle count (approx). Default: 500000",
    )
    parser.add_argument(
        "--apply-modifiers",
        action="store_true",
        default=True,
        help="Apply modifiers before export (default: true).",
    )
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Ensure we have a scene.
    if bpy.context.scene is None:
        bpy.data.scenes.new("Scene")


def import_obj(path):
    # Blender 4+ uses wm.obj_import; older uses import_scene.obj.
    if hasattr(bpy.ops.wm, "obj_import"):
        bpy.ops.wm.obj_import(filepath=path)
    else:
        bpy.ops.import_scene.obj(filepath=path)


def import_gltf(path):
    bpy.ops.import_scene.gltf(filepath=path)


def import_any(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".obj":
        import_obj(path)
        return
    if ext in (".glb", ".gltf"):
        import_gltf(path)
        return
    raise RuntimeError(f"Unsupported input extension: {ext}")


def list_mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def count_triangles(obj):
    mesh = obj.data
    # Polygons can be ngons; treat each polygon as (n-2) triangles.
    tri_count = 0
    for poly in mesh.polygons:
        v = poly.loop_total
        if v >= 3:
            tri_count += v - 2
    return tri_count


def total_triangles(mesh_objects):
    return sum(count_triangles(obj) for obj in mesh_objects)


def ensure_object_mode():
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def decimate_mesh_objects(mesh_objects, ratio):
    ensure_object_mode()
    view_layer = bpy.context.view_layer

    for obj in mesh_objects:
        view_layer.objects.active = obj
        obj.select_set(True)

        mod = obj.modifiers.new(name="Decimate", type="DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        # Reduce edge artifacts for large decimations.
        mod.use_collapse_triangulate = True

        bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)


def export_glb(path):
    # Export selection only: mesh objects in the scene.
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type == "MESH")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


def main():
    if "--" not in sys.argv:
        print("Expected '--' before script args.", file=sys.stderr)
        sys.exit(2)

    args = parse_args(sys.argv[sys.argv.index("--") + 1 :])

    t0 = time.time()
    clear_scene()
    print(f"Importing: {args.input}", flush=True)
    import_any(args.input)

    mesh_objects = list_mesh_objects()
    if not mesh_objects:
        raise RuntimeError("No mesh objects imported.")

    src_tris = total_triangles(mesh_objects)
    print(f"Imported mesh objects: {len(mesh_objects)}", flush=True)
    print(f"Source triangles: {src_tris}", flush=True)

    target = max(1_000, int(args.target_triangles))
    ratio = min(1.0, max(0.0005, target / max(1, src_tris)))
    print(f"Target triangles: {target} (ratio={ratio:.6f})", flush=True)

    if ratio < 0.999:
        print("Decimating...", flush=True)
        decimate_mesh_objects(mesh_objects, ratio)
        dst_tris = total_triangles(mesh_objects)
        print(f"Decimated triangles: {dst_tris}", flush=True)
    else:
        print("Skipping decimation (already under target).", flush=True)

    print(f"Exporting GLB: {args.output}", flush=True)
    export_glb(args.output)

    print(f"Done in {time.time() - t0:.2f}s", flush=True)


if __name__ == "__main__":
    main()
