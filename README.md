# pfodWeb

A web-based [pfod protocol](https://www.pfod.com.au/) client for controlling and monitoring Arduino, ESP32, 
and other embedded devices from a browser — no app install required. pfodWeb renders device-defined drawings, menus, 
and charts, and talks to devices over directly via HTTP and via Serial, BLE and TCP/IP via the companion **pfodProxy** bridge.

pfodWeb includes a build-in Designer that lets you create menus and sub-meus of buttons, sliders and charts. pfodWeb charts include data logging and fromatting options. 

pfodWeb is distributed as a single, self-contained HTML file (all JS/CSS/fonts inlined) so it can be opened directly in a browser. 
It can also be served directly from the microprocessor itself for complete off-line stand alone deployment.

## Repository Layout

| Path | Description |
|---|---|
| `pfodWeb_src/` | JavaScript/HTML/CSS source for pfodWeb. **Edit here** — never edit the built HTML files directly. |
| `pfodProxy_rs/` | Rust source for pfodProxy, the HTTP-to-device proxy (serial / TCP / BLE) that pfodWeb talks to for those connections. |
| `data/` | Compressed (`.gz`) files to be served from the microprocessor's file system for stand alone deployment. |
| `extraFonts/` | Optional supplementary font subsets (Cyrillic, Greek, etc.) loadable without rebuilding pfodWeb. |
| `variants/` | Board definitions (`arduino/`, `esp32/`) used when generating code in the designer. |
| `docs/` | User guides and licensing documentation — see [docs/index.html](docs/index.html). |
| `windows/`, `linux/`, `macOS/` | Staged, platform-specific build output (pfodWeb.html + pfodProxy binary), produced by the build scripts below. |

## Building

Each platform has a top-level build script that compiles `pfodProxy` (Rust) and bundles `pfodWeb.html` from `pfodWeb_src/`, staging the result into the matching output directory:

| Platform | Script | Output |
|---|---|---|
| Windows | `windows-build.bat` | `windows/` |
| Linux | `build-linux.bat` | `linux/` |
| macOS | `build-macOSApp.sh` | `macOS/` |

Building pfodProxy requires the [Rust toolchain](https://rustup.rs/) (`cargo`).

To rebuild just the standalone `pfodWeb.html` from source without the proxy:

```sh
cd pfodWeb_src
node build-bundle.js
```

To regenerate the device-served `data/` bundles ( served from microprocessor itself for stand alone deployment):

```sh
build_data.bat   # Windows
./build_data.sh  # Linux/macOS
```

## Documentation

Full user and reference documentation is in [`docs/`](docs/index.html):

- [pfodWeb User Guide](docs/pfodWeb-guide.html) — connecting, interface layout, toolbar, plotting CSV data.
- [pfodWeb Chart Mode Guide](docs/pfodWeb-chart-mode-guide.html) — chart display, raw message viewer, field customization.
- [pfodWeb extraFonts Guide](docs/pfodWeb-extraFonts-guide.html) — adding font subsets without rebuilding.
- [Comparison](docs/Comparision.html) — pfodWeb vs. other Arduino remote-control approaches.
- [License](docs/pfodWeb_pfodProxy_License.html) / [Rust Third-Party Licenses](docs/RustThirdPartyLicenses.html)

## License

(c) Forward Computing and Control Pty. Ltd. See [docs/pfodWeb_pfodProxy_License.html](docs/pfodWeb_pfodProxy_License.html) for full terms; pfodProxy's third-party Rust crate licenses are listed in [docs/RustThirdPartyLicenses.html](docs/RustThirdPartyLicenses.html).
