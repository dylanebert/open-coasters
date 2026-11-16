# Contributing an atomic asset

Static instances and planar profiles are separate provisional subsets. Start with
[instance-contract.md](instance-contract.md) or [profile-contract.md](profile-contract.md)
for meaning, supported content and numerical limits. An atomic submission requires no construction rules.

## Prepare a delivery

Keep each asset's evidence together under `assets/<name>/`:

- Archive the source at an identified revision (and record source blob hashes or
  equivalent immutable identifiers), plus editable source where applicable
- Establish MIT permission for the contributed material; preserve copyright,
  attribution and license notices. Record upstream URLs, authors and revision.
  Do not infer permission from an export or a filename
- Record the authored origin, meter scale and frame with measured source landmarks.
  State which geometry and appearance are retained and which are omitted
- Include repeatable export commands, tool versions and any conversion settings.
  Deliver ordinary JSON `.gltf` and its dependent buffers under `demo/public/assets/`;
  preserve relative URIs

Existing evidence layouts include `assets/blitz-tie/PROVENANCE.md` and
`assets/blitz-profile/PROVENANCE.md`. Their rebuild scripts are asset-specific,
not required exporter infrastructure.

## Check the exported subset

Install Bun 1.4.4 or newer and the pinned dependencies once:

```sh
cd demo
bun install --frozen-lockfile
cd ..
```

From the repository root, choose the claim you are submitting:

```sh
bun demo/tools/check-asset.ts instance /absolute/path/to/part.gltf
bun demo/tools/check-asset.ts profile /absolute/path/to/section.gltf
```

Relative input paths are relative to your working directory; dependent buffers
resolve relative to the input document. From another directory use the absolute
path to `demo/tools/check-asset.ts`. A failed check exits nonzero. This command
runs the existing subset gates and Shallot's public decoder (and profile
extraction for profiles); it is not a new full validator. It needs no upstream
checkout, Blender, GPU or browser for checked-in deliveries.

A pass is **not full glTF validation or source-fidelity validation**. Run
[Khronos glTF-Validator](https://github.com/KhronosGroup/glTF-Validator) separately
on the delivery and record its version, command and findings. Fix format errors;
do not treat subset acceptance as permission to submit invalid glTF.

## Supply independent evidence for review

Compare exported directed triangles, metric frame/origin and any claimed retained
appearance directly against archived source, independently of exporter helpers.
Include deterministic CPU checks using checked-in inputs and negative controls
that demonstrate rejection of the corruptions your claims cover. Qualify actual
exported files in a separate native consumer (for example Blender import), recording
tool version, commands, measured discrepancies and limitations. Reusing the same
decoder twice is not independent source evidence.

Submit source/notices, exports, reproduction instructions and evidence together.
Review separates legal/source documentation, glTF format validity, subset
acceptance and source/adoption claims. Acceptance is limited to the submitted asset and its verified claims. Viewer integration is not
required for an atomic submission.
