"""Read explicitly selected static linear section geometry with OpenUSD."""
import argparse
import json
from math import isfinite

from pxr import Gf, Sdf, Tf, Usd, UsdGeom

PLANE_TOLERANCE_M = 1e-6


def prim_path(text):
    if Sdf.Path.IsValidPathString(text):
        path = Sdf.Path(text)
        if path.IsAbsolutePath() and path.IsPrimPath() and not path.ContainsPrimVariantSelection():
            return path
    raise ValueError(f'{text}: expected an absolute prim path')


def selected_prim(stage, path):
    prim = stage.GetPrimAtPath(path)
    if not prim or not prim.IsActive() or not prim.IsDefined() or not prim.IsLoaded() or prim.IsAbstract():
        raise ValueError(f'{path}: no selected active, loaded, concrete prim')
    if prim.IsInstance() or prim.IsInstanceProxy() or prim.IsInPrototype():
        raise ValueError(f'{path}: instance and prototype selection is unsupported')
    return prim


def static_value(attr):
    if attr.GetNumTimeSamples() or attr.HasSpline():
        raise ValueError(f'{attr.GetPath()}: time samples and splines are unsupported')
    return attr.Get(Usd.TimeCode.Default())


def world_matrix(cache, prim):
    ancestor = prim
    while ancestor and not ancestor.IsPseudoRoot():
        xform = UsdGeom.Xformable(ancestor)
        if xform:
            order = static_value(xform.GetXformOpOrderAttr())
            # USD applies only the suffix after the last reset. Inspect the
            # tokens directly: GetOrderedXformOps warns and drops dangling ops.
            for token in reversed(order or ()):
                if token == '!resetXformStack!':
                    break
                attr = ancestor.GetAttribute(token.removeprefix('!invert!'))
                if not attr:
                    raise ValueError(f'{ancestor.GetPath()}: dangling xformOpOrder entry {token}')
                static_value(attr)
            if xform.GetResetXformStack():
                break
        ancestor = ancestor.GetParent()
    matrix = cache.GetLocalToWorldTransform(prim)
    if not all(isfinite(v) for row in matrix for v in row) or tuple(matrix.GetColumn(3)) != (0, 0, 0, 1):
        raise ValueError(f'{prim.GetPath()}: expected a finite affine world transform')
    return matrix


def read_section(stage, frame_path, curve_paths):
    """Return metric XY and separate source placement; no appearance or region checks."""
    frame_path = prim_path(frame_path)
    paths = [prim_path(p) for p in curve_paths]
    if not paths or len(set(paths)) != len(paths):
        raise ValueError('select one or more distinct curve prim paths')
    frame = selected_prim(stage, frame_path)
    if not frame.IsA(UsdGeom.Xform):
        raise ValueError(f'{frame_path}: expected an Xform frame')
    units = UsdGeom.GetStageMetersPerUnit(stage)
    if not UsdGeom.StageHasAuthoredMetersPerUnit(stage) or not isfinite(units) or units <= 0:
        raise ValueError('expected explicit, positive finite metersPerUnit')
    up = UsdGeom.GetStageUpAxis(stage)
    if not stage.HasAuthoredMetadata('upAxis') or up not in ('Y', 'Z'):
        raise ValueError('expected explicit Y or Z upAxis')

    cache = UsdGeom.XformCache(Usd.TimeCode.Default())
    frame_world = world_matrix(cache, frame)
    determinant = frame_world.GetDeterminant3()
    if not isfinite(determinant) or determinant == 0:
        raise ValueError(f'{frame_path}: singular or noninvertible frame')
    frame_inverse = frame_world.GetInverse()
    origin = frame_world.ExtractTranslation() * units
    if not all(isfinite(v) for v in origin):
        raise ValueError(f'{frame_path}: nonfinite metric placement')
    placement = [list(row) for row in frame_world]
    placement[3][:3] = origin

    result = []
    for path in paths:
        if path == frame_path or not path.HasPrefix(frame_path):
            raise ValueError(f'{path}: expected a strict descendant of {frame_path}')
        prim = selected_prim(stage, path)
        curves = UsdGeom.BasisCurves(prim)
        if not curves:
            raise ValueError(f'{path}: expected BasisCurves')
        if static_value(curves.GetTypeAttr()) != 'linear':
            raise ValueError(f'{path}: only linear BasisCurves are supported')
        wrap = static_value(curves.GetWrapAttr())
        if wrap not in ('periodic', 'nonperiodic'):
            raise ValueError(f'{path}: expected periodic or nonperiodic wrap')
        closed = wrap == 'periodic'
        counts = static_value(curves.GetCurveVertexCountsAttr())
        points = static_value(curves.GetPointsAttr())
        minimum = 3 if closed else 2
        if not counts or points is None or sum(counts) != len(points) or any(n < minimum for n in counts):
            raise ValueError(f'{path}: invalid curveVertexCounts for points and wrap')

        # Gf uses row vectors: geometry-local -> world -> frame-local.
        relative = world_matrix(cache, prim) * frame_inverse
        offset = 0
        for index, count in enumerate(counts):
            xy = []
            for point in points[offset:offset + count]:
                x, y, z = relative.TransformAffine(Gf.Vec3d(*point)) * units
                if not all(isfinite(v) for v in (x, y, z)):
                    raise ValueError(f'{path}[{index}]: nonfinite metric point')
                if abs(z) > PLANE_TOLERANCE_M:
                    raise ValueError(f'{path}[{index}]: off frame XY plane (|z| > {PLANE_TOLERANCE_M:g} m)')
                xy.append((x, y))
            edges = zip(xy, xy[1:] + (xy[:1] if closed else []))
            if len(set(xy)) < minimum or any(a == b for a, b in edges):
                raise ValueError(f'{path}[{index}]: degenerate XY polyline')
            result.append(dict(primPath=str(path), curveIndex=index, closed=closed, xyMeters=xy))
            offset += count
    return dict(framePath=str(frame_path), stageUpAxis=up, frameToWorldMeters=placement, curves=result)


def main():
    parser = argparse.ArgumentParser(description=__doc__, epilog=(
        'Outputs frame-local XY and a separate Gf row-vector placement. '
        'Does not validate the full stage or check filled regions, appearance, or sweep behavior.'))
    parser.add_argument('stage')
    parser.add_argument('frame')
    parser.add_argument('curves', nargs='+')
    args = parser.parse_args()
    try:
        stage = Usd.Stage.Open(args.stage)
        if not stage:
            raise ValueError('stage could not be opened')
        section = read_section(stage, args.frame, args.curves)
    except (Tf.ErrorException, ValueError) as error:
        parser.exit(1, f'{error}\n')
    print(json.dumps(section, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
