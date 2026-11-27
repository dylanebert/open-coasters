"""Local OpenUSD conformance witness for this standalone tie, not a USD validator."""
from math import isfinite
from pathlib import Path
import unittest

from pxr import Gf, Sdf, Usd, UsdGeom, UsdShade

FIXTURE = Path(__file__).with_name('tie.usda')


class PlacedTie(unittest.TestCase):
    def setUp(self):
        # Each test gets a private layer. No mutation can touch the delivery.
        self.stage = Usd.Stage.Open(Sdf.Layer.OpenAsAnonymous(str(FIXTURE)))

    def near(self, actual, expected, claim):
        for a, b in zip(actual, expected, strict=True):
            self.assertAlmostEqual(a, b, delta=1e-6, msg=f'{claim}: {actual} != {expected}')

    def check_tie(self):
        stage = self.stage
        root = stage.GetDefaultPrim()
        self.assertTrue(root and root.IsA(UsdGeom.Xform) and root.GetPath() == Sdf.Path('/Tie'),
                        'defaultPrim selection: expected the top-level Tie')
        children = root.GetChildren()
        self.assertEqual([p.GetName() for p in children], ['Bar'], 'mesh hierarchy')
        mesh = UsdGeom.Mesh(children[0])
        self.assertTrue(mesh, 'Bar is a native Mesh')
        self.assertEqual(mesh.GetSubdivisionSchemeAttr().Get(), UsdGeom.Tokens.none)
        self.assertEqual(mesh.GetOrientationAttr().Get(), UsdGeom.Tokens.rightHanded)
        self.assertEqual(list(mesh.GetFaceVertexCountsAttr().Get()), [4] * 6, 'quad counts')
        self.assertEqual(list(mesh.GetFaceVertexIndicesAttr().Get()), [
            3, 2, 1, 0, 4, 5, 6, 7, 0, 1, 5, 4, 1, 2, 6, 5, 2, 3, 7, 6, 3, 0, 4, 7,
        ], 'polygon winding')

        self.assertTrue(UsdGeom.StageHasAuthoredMetersPerUnit(stage), 'explicit stage units')
        units = UsdGeom.GetStageMetersPerUnit(stage)
        self.assertTrue(isfinite(units) and units > 0, 'valid stage units')
        self.assertTrue(stage.HasAuthoredMetadata('upAxis'), 'explicit up axis')
        up = UsdGeom.GetStageUpAxis(stage)
        self.assertIn(up, (UsdGeom.Tokens.y, UsdGeom.Tokens.z))
        transforms = UsdGeom.XformCache(Usd.TimeCode.Default())

        def place(matrix, point):
            x, y, z = matrix.Transform(Gf.Vec3d(*point)) * units
            if up == UsdGeom.Tokens.z:
                x, y, z = x, z, -y
            # Place the Y-up part with +90 degrees about Y and translation (2, 1, -3) m.
            return Gf.Vec3d(2 + z, 1 + y, -3 - x)

        root_world = transforms.GetLocalToWorldTransform(root)
        bar_world = transforms.GetLocalToWorldTransform(mesh.GetPrim())
        posed = [place(bar_world, p) for p in mesh.GetPointsAttr().Get()]
        self.assertEqual(len(posed), 8, 'point count')
        self.assertAlmostEqual((posed[1] - posed[0]).GetLength(), 1.20,
                               delta=1e-6, msg='physical scale: tie edge is 1.20 m')
        self.near((posed[4] - posed[0]).GetNormalized(), (0, 1, 0), 'physical up axis')

        # Hand calculation from the design, not the exported USD: Rz(+90) sends the
        # child offset (.06,.09,.04) to (-.09,.06,.04). The two rotations cancel on
        # the mesh, so its first point in source world metres is (.23,-.22,.12).
        # The placed point is (2 - world_y, 1 + world_z, -3 - world_x).
        probes = ((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1))
        for point, target in zip(probes, (
                (2.20, 1.05, -3.30), (1.20, 1.05, -3.30),
                (2.20, 1.05, -2.30), (2.20, 2.05, -3.30)), strict=True):
            self.near(place(root_world, point), target, 'placed root frame')
        for point, target in zip(probes, (
                (2.14, 1.09, -3.21), (2.14, 1.09, -4.21),
                (1.14, 1.09, -3.21), (2.14, 2.09, -3.21)), strict=True):
            self.near(place(bar_world, point), target, 'placed child frame')
        for actual, target in zip(posed, (
                (2.22, 1.12, -3.23), (2.22, 1.12, -4.43), (2.02, 1.12, -4.33), (2.02, 1.12, -3.23),
                (2.22, 1.22, -3.23), (2.22, 1.22, -4.43), (2.02, 1.22, -4.33), (2.02, 1.22, -3.23)), strict=True):
            self.near(actual, target, 'placed mesh point')

        material, _ = UsdShade.MaterialBindingAPI(mesh.GetPrim()).ComputeBoundMaterial()
        self.assertTrue(material and material.GetPath() == Sdf.Path('/_materials/TieSteel'),
                        'computed material binding: expected TieSteel')
        surface, _, _ = material.ComputeSurfaceSource()
        self.assertTrue(surface, 'connected material surface')
        self.assertEqual(surface.GetIdAttr().Get(), 'UsdPreviewSurface')
        for name, expected in [('diffuseColor', (.125, .25, .5)), ('metallic', .75),
                               ('roughness', .375), ('opacity', 1)]:
            attribute = surface.GetInput(name)
            self.assertFalse(attribute.HasConnectedSource(), name)
            self.assertEqual(attribute.Get(), expected, name)
        diffuse = surface.GetInput('diffuseColor').GetAttr()
        self.assertEqual(Usd.ColorSpaceAPI.ComputeColorSpaceName(diffuse, None),
                         'lin_rec709_scene', 'effective diffuse color space')

    def test_placed_tie(self):
        self.check_tie()

    def test_wrong_selection(self):
        self.stage.SetDefaultPrim(self.stage.GetPrimAtPath('/_materials'))
        with self.assertRaisesRegex(AssertionError, 'defaultPrim selection'):
            self.check_tie()

    def test_wrong_scale(self):
        UsdGeom.SetStageMetersPerUnit(self.stage, 1)
        with self.assertRaisesRegex(AssertionError, 'physical scale'):
            self.check_tie()

    def test_wrong_up_axis(self):
        UsdGeom.SetStageUpAxis(self.stage, UsdGeom.Tokens.y)
        with self.assertRaisesRegex(AssertionError, 'physical up axis'):
            self.check_tie()

    def test_wrong_child_transform(self):
        bar = self.stage.GetPrimAtPath('/Tie/Bar')
        UsdGeom.XformCommonAPI(bar).SetTranslate(Gf.Vec3d(0))
        with self.assertRaisesRegex(AssertionError, 'placed child frame'):
            self.check_tie()

    def test_wrong_winding(self):
        indices = UsdGeom.Mesh.Get(self.stage, '/Tie/Bar').GetFaceVertexIndicesAttr()
        changed = list(indices.Get())
        changed[:4] = reversed(changed[:4])
        indices.Set(changed)
        with self.assertRaisesRegex(AssertionError, 'polygon winding'):
            self.check_tie()

    def test_wrong_computed_binding(self):
        original = UsdShade.Material.Get(self.stage, '/_materials/TieSteel')
        alternate = UsdShade.Material.Define(self.stage, '/_materials/AlternateSteel')
        # Same shader and same direct mesh relationship. Only the resolved identity changes.
        self.assertTrue(alternate.CreateSurfaceOutput().ConnectToSource(original.GetSurfaceOutput()))
        self.assertTrue(UsdShade.MaterialBindingAPI.Apply(self.stage.GetDefaultPrim()).Bind(
            alternate, UsdShade.Tokens.strongerThanDescendants))
        with self.assertRaisesRegex(AssertionError, 'computed material binding'):
            self.check_tie()

    def test_wrong_diffuse_color_space(self):
        material = UsdShade.Material.Get(self.stage, '/_materials/TieSteel')
        color_space = Usd.ColorSpaceAPI(material.GetPrim()).GetColorSpaceNameAttr()
        self.assertTrue(color_space.Set('srgb_rec709_scene'))
        with self.assertRaisesRegex(AssertionError, 'effective diffuse color space'):
            self.check_tie()


if __name__ == '__main__':
    unittest.main()
