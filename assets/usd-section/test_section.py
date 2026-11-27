from pathlib import Path
import unittest

from pxr import Gf, Sdf, Usd, UsdGeom

from check_section import read_section

FIXTURE = Path(__file__).with_name('section.usda')
FRAME = '/Source/Frame'
OFFSET = FRAME + '/Offset'
LOOPS = OFFSET + '/Loops'
STRIP = FRAME + '/Strip'
UNSELECTED = FRAME + '/Unselected'


class Section(unittest.TestCase):
    def setUp(self):
        self.stage = Usd.Stage.Open(Sdf.Layer.OpenAsAnonymous(str(FIXTURE)))

    def read(self, frame=FRAME, paths=(STRIP, LOOPS)):
        return read_section(self.stage, frame, paths)

    def test_metric_xy_and_source_placement(self):
        # Offset maps (x,y) -> (2x+2,3y-1). Frame maps (x,y) -> (2x+4,y+5),
        # then Source maps (x,y) -> (40-3y,2x-20). The latter two put the
        # frame origin at (25,-12,0) without changing the extracted shape.
        self.assertEqual(self.read(), {
            'framePath': FRAME,
            'stageUpAxis': 'Z',
            'frameToWorldMeters': [[0, 4, 0, 0], [-3, 0, 0, 0], [0, 0, 1, 0], [6.25, -3, 0, 1]],
            'curves': [
                dict(primPath=STRIP, curveIndex=0, closed=False, xyMeters=[(.25, 0), (-.25, .5), (0, .25)]),
                dict(primPath=LOOPS, curveIndex=0, closed=True, xyMeters=[(1, -.25), (.5, -.25), (.5, .5)]),
                dict(primPath=LOOPS, curveIndex=1, closed=True, xyMeters=[(1, -.25), (1.5, .5), (1, .5)]),
            ],
        })

    def test_changed_frame_and_selection(self):
        strip, *_ = self.read()['curves']
        # Moving F above Frame brings Frame's transform into the geometry.
        moved = self.read('/Source', (STRIP,))
        self.assertEqual(moved['framePath'], '/Source')
        self.assertEqual(moved['curves'], [dict(strip, xyMeters=[(1.5, 1.25), (.5, 1.75), (1, 1.5)])])
        self.assertEqual(self.read(paths=(UNSELECTED,))['curves'], [
            dict(primPath=UNSELECTED, curveIndex=0, closed=False, xyMeters=[(2, 0), (3, 0)]),
        ])

    def test_missing_or_invalid_selection(self):
        for frame, paths, error in (
            ('/Missing', (STRIP,), 'no selected'),
            (FRAME, (FRAME + '/Missing',), 'no selected'),
            (STRIP, (LOOPS,), 'Xform frame'),
            (OFFSET, (STRIP,), 'strict descendant'),
            (FRAME, (FRAME,), 'strict descendant'),
            (FRAME, (), 'distinct curve'),
            (FRAME, (STRIP, STRIP), 'distinct curve'),
            (FRAME, (OFFSET,), 'expected BasisCurves'),
        ):
            with self.subTest(frame=frame, paths=paths), self.assertRaisesRegex(ValueError, error):
                self.read(frame, paths)

    def test_stage_up_does_not_rotate_xy(self):
        original = self.read()
        UsdGeom.SetStageUpAxis(self.stage, UsdGeom.Tokens.y)
        self.assertEqual(self.read(), dict(original, stageUpAxis='Y'))

    def test_counts(self):
        counts = UsdGeom.BasisCurves.Get(self.stage, LOOPS).GetCurveVertexCountsAttr()
        for invalid in ([3, 4], [2, 4]):  # Bad sum, then correct sum but too few for a loop.
            counts.Set(invalid)
            with self.subTest(counts=invalid), self.assertRaisesRegex(ValueError, 'invalid curveVertexCounts'):
                self.read()

    def test_off_plane(self):
        points = UsdGeom.BasisCurves.Get(self.stage, STRIP).GetPointsAttr()
        original = self.read()
        points.Set([(1, 0, 2e-6), (-1, 2, 0), (0, 1, 0)])  # 0.5 micrometres
        self.assertEqual(self.read(), original)
        points.Set([(1, 0, .01), (-1, 2, 0), (0, 1, 0)])
        with self.assertRaisesRegex(ValueError, 'off frame XY plane'):
            self.read()

    def test_repeated_closing_point(self):
        points = UsdGeom.BasisCurves.Get(self.stage, LOOPS).GetPointsAttr()
        counts = UsdGeom.BasisCurves.Get(self.stage, LOOPS).GetCurveVertexCountsAttr()
        original = list(points.Get())
        counts.Set([4, 3])
        points.Set(original[:3] + original[:1] + original[3:])
        with self.assertRaisesRegex(ValueError, 'degenerate XY polyline'):
            self.read()

    def test_cubic_is_not_a_control_polygon(self):
        curves = UsdGeom.BasisCurves.Get(self.stage, LOOPS)
        # Two valid one-span periodic Bezier control groups still aren't linear.
        curves.GetBasisAttr().Set('bezier')
        curves.GetTypeAttr().Set('cubic')
        with self.assertRaisesRegex(ValueError, 'only linear BasisCurves'):
            self.read()

    def test_pinned_wrap_is_not_nonperiodic(self):
        UsdGeom.BasisCurves.Get(self.stage, STRIP).GetWrapAttr().Set('pinned')
        with self.assertRaisesRegex(ValueError, 'periodic or nonperiodic wrap'):
            self.read()

    def test_singular_frame(self):
        self.stage.GetPrimAtPath(FRAME).GetAttribute('xformOp:scale').Set(Gf.Vec3f(0, 1, 1))
        with self.assertRaisesRegex(ValueError, 'singular or noninvertible frame'):
            self.read()

    def test_reset_below_frame(self):
        UsdGeom.Xform.Get(self.stage, OFFSET).SetResetXformStack(True)
        # Offset's (4,-1), (2,-1), (2,2) are now world points. Undo the
        # frame's (25-3y,4x-12), then multiply by .25 metres per stage unit.
        loops = self.read(paths=(LOOPS,))['curves']
        for actual, expected in zip(loops[0]['xyMeters'], (
                (.6875, 1.75), (.6875, 23 / 12), (.875, 23 / 12)), strict=True):
            for a, b in zip(actual, expected, strict=True):
                self.assertAlmostEqual(a, b, delta=1e-12)

    def test_dangling_transform_op(self):
        for path, token in ((FRAME, 'xformOp:translate:missing'),
                            (OFFSET, '!invert!xformOp:translate:missing')):
            order = UsdGeom.Xform.Get(self.stage, path).GetXformOpOrderAttr()
            with self.subTest(path=path, token=token):
                original = list(order.Get())
                order.Set(original + [token])
                try:
                    with self.assertRaises(ValueError) as error:
                        self.read()
                    self.assertIn(f'{path}: dangling xformOpOrder entry {token}', str(error.exception))
                finally:
                    order.Set(original)

    def test_inverse_op_and_overridden_stack(self):
        source = UsdGeom.Xform.Get(self.stage, '/Source')
        source.GetXformOpOrderAttr().Set(['xformOp:translate:missing'])
        UsdGeom.Xform.Get(self.stage, FRAME).SetResetXformStack(True)
        UsdGeom.BasisCurves.Get(self.stage, UNSELECTED).GetXformOpOrderAttr().Set([
            'xformOp:translate:missing',
        ])
        offset = UsdGeom.Xform.Get(self.stage, OFFSET)
        offset.GetXformOpOrderAttr().Set([
            'xformOp:translate', 'xformOp:scale', '!invert!xformOp:translate',
        ])
        # The reset on Frame excludes Source. Offset now maps (x,y) -> (2x-2,3y+2).
        loops = self.read(paths=(LOOPS,))['curves']
        self.assertEqual(loops[0]['xyMeters'], [(0, .5), (-.5, .5), (-.5, 1.25)])

    def test_time_sample_on_transform(self):
        self.stage.GetPrimAtPath(OFFSET).GetAttribute('xformOp:translate').Set(Gf.Vec3d(0), 1)
        with self.assertRaisesRegex(ValueError, 'time samples and splines are unsupported'):
            self.read()


if __name__ == '__main__':
    unittest.main()
