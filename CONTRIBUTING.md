# Contributing

You can contribute a [static part](instance-contract.md) or a
[profile](profile-contract.md). Those documents describe the supported geometry
and file formats. You do not need to supply track-construction rules or add your
asset to the demo.

## Prepare the files

Keep source files and their documentation under `assets/<name>/`. Include:

- Original source, its URL, author and revision, and a file hash or other immutable identifier
- Editable source where applicable
- MIT permission and the original copyright, license and attribution notices
- Measured dimensions, origin and coordinate axes, with any changes made during conversion
- A description of geometry and appearance retained or omitted
- Export commands, tool versions and settings needed to reproduce the result

Put exported JSON `.gltf` files and their buffers under `demo/public/assets/`.
Keep relative buffer paths intact. Do not infer permission from a filename or
an export.

For examples, see the [Blitz tie](assets/blitz-tie/PROVENANCE.md) and
[Modern profiles](assets/blitz-profile/PROVENANCE.md). Their export scripts are
specific to those assets; you do not need to use them.

## Check the export

With Bun 1.4.4 or newer, install dependencies from `demo/`:

```sh
bun install --frozen-lockfile
```

Then, from the repository root, run the appropriate check:

```sh
bun demo/tools/check-asset.ts instance /path/to/part.gltf
bun demo/tools/check-asset.ts profile /path/to/profile.gltf
```

Input paths are relative to your working directory; buffer paths are relative
to the glTF file. From another directory, use an absolute path to the script.
The command decodes the file and checks the supported subset, including profile
extraction where requested. Errors exit nonzero. Checked-in exports need no
upstream checkout, Blender, GPU or browser for this check.

Also run [Khronos glTF-Validator](https://github.com/KhronosGroup/glTF-Validator)
and record its version, command and findings. Fix format errors. The local check
does not establish full glTF validity or fidelity to the source.

## Include verification

Compare exported triangles (including winding), dimensions, origin, axes and
retained appearance against the source without reusing the exporter's conversion code.
Include repeatable CPU checks using checked-in files, with deliberate corruptions
to show the checks can fail. Import the export into another tool, such as Blender,
and record its version, commands, measured differences and limitations. Two uses
of the same decoder are not independent verification.

Submit the files, notices, export instructions and verification together. Review
checks permission and provenance, glTF validity, supported content, source fidelity
and use in another tool separately. Acceptance covers only the asset and behavior
that were checked.
