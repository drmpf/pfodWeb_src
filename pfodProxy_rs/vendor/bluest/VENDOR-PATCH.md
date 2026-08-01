# Vendored bluest — local patch

Upstream: `bluest` 0.6.9, unmodified from crates.io apart from the single
change recorded below.  Licensed BSD-2-Clause OR Apache-2.0 (`LICENSE-BSD`,
`LICENSE-APACHE`), both already on `about.toml`'s accepted list.

This copy exists so pfodProxy can build against bluest with one upstream
check removed.  It is a path dependency, declared under the `cfg(windows)`
target in `../../Cargo.toml`; macOS and Linux do not build bluest at all
(they use btleplug — see `src/ble.rs`).

Only `src/windows/**` and the shared top-level modules compile here.  The
CoreBluetooth, BlueZ and Android backends are carried along untouched so
this stays a faithful copy that a future upgrade can be diffed against;
bluest's own `Cargo.toml` target-gates their dependencies, so nothing extra
is fetched or built on Windows.

## The patch

One hunk, in `src/windows/adapter.rs`, inside `AdapterImpl::scan()`.
Upstream opens the per-advertisement closure with:

```rust
if event_args.AdvertisementType().ok()? == BluetoothLEAdvertisementType::NonConnectableUndirected {
    // Device cannot be created from a non-connectable advertisement
    return None;
}
```

That block is deleted, and `BluetoothLEAdvertisementType` drops out of the
`use` list at the top of the same file since nothing else referenced it.
Both sites carry a comment pointing back here.

## Why

The premise — that a device cannot be created from an advertisement Windows
types `NonConnectableUndirected` — does not hold on the Bluetooth stack
pfodProxy targets.  Measured over a single 20-second scan, reading the raw
AD structures rather than the type field:

| address        | Flags | NUS advertised | packets | `AdvertisementType` |
|----------------|-------|----------------|---------|---------------------|
| `08A6F73115FA` | 0x06  | yes            | 62      | NonConnectableUndirected |
| `C68B99725B80` | 0x06  | yes            | 5       | NonConnectableUndirected |

Flags 0x06 is LE General Discoverable Mode + BR/EDR Not Supported: these are
ordinary connectable peripherals.  `08A6F73115FA` is a pfod device named
`pfod_LedOnOff`, and `Device::from_addr` on that exact address opened it,
discovered the Nordic UART Service and both its characteristics, and
subscribed to notifications — all while every advertisement it sent was
being typed non-connectable and discarded by the check above.

With the check in place, `Adapter::scan()` yielded nothing at all across
repeated runs, including bluest's own `examples/scan.rs`, so no pfod device
could be discovered or connected to on Windows.

The same stack reports a fixed +27 dBm RSSI for devices whose real signal
strength is -41 and -86 (confirmed against the same devices on macOS).  No
BLE radio emits half a watt; the advertisement metadata Windows attaches to
these packets is simply not dependable, and `AdvertisementType` is part of
it.  See `src/ble.rs` in this repo for the RSSI measurements.

## Why removing it is safe

The check is redundant as well as wrong.  The code immediately after it
already handles the failure it was guarding against:

```rust
match Device::from_addr(addr, kind).await {
    Ok(device) => Some(AdvertisingDevice { device, rssi, adv_data }),
    Err(err) => { warn!("Error creating device: {:?}", err); None }
}
```

An advertisement from something that genuinely cannot be opened — a real
beacon — still falls out through that `Err` arm and never reaches the
caller.  pfodProxy additionally ignores any device that does not advertise
the Nordic UART Service (`has_nus` in `src/ble_win.rs`), so beacons are
filtered twice over.

## Upgrading bluest

1. Extract the new version over this directory.
2. Re-apply the deletion above; the comment block at the patch site marks
   the spot.
3. Confirm `Adapter::scan()` still yields NUS devices on Windows — that is
   the behaviour this patch exists to restore, and it is not covered by any
   test.

Worth reporting upstream: gating on `AdvertisementType` is unsound on a
stack that mis-reports it, and the guard duplicates an existing error path.
