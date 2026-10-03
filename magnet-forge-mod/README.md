# Magnet (Forge, Minecraft 26.3)

A toggleable magnet that pulls dropped items (and experience orbs) towards you from up to 10 blocks away.

| Target            | Version                                   |
|-------------------|-------------------------------------------|
| Minecraft         | 26.3                                      |
| Minecraft Forge   | 66.0.4 (`loaderVersion` / dependency `[66,)`) |
| Java              | 25 (what Mojang ships with 26.1+)         |
| Build tool        | Gradle 9.7.1 wrapper + ForgeGradle 7      |

## How it works

* **Right-click** the magnet to switch it on or off. A switched-on magnet glows (enchantment glint) and is named
  "Magnet (Active)"; the action bar confirms the change.
* While it is **switched on and anywhere in your inventory** (hotbar, main inventory, off-hand), every dropped item
  within **10 blocks** (a sphere around you) flies towards you and you pick it up as usual. Experience orbs are
  pulled too.
* Items you just threw away yourself (Q key) are left alone for **10 seconds**, so you can still drop things while
  the magnet is on. Items that still have a pickup delay (freshly dropped by someone else, or given one by a
  command) are not pulled either.
* When your inventory has no room for an item, that item stays where it is until you make space, instead of being
  dragged around behind you. Items a command has reserved for another player can be pulled but not picked up; they
  drop at your feet.
* It does nothing in spectator mode, and a magnet lying on the ground does nothing.
* Everything is configurable in `config/magnet-common.toml`. Forge watches the file, so saved edits apply within a
  few seconds without a restart:

| Setting                  | Default | Meaning                                                    |
|--------------------------|---------|------------------------------------------------------------|
| `range`                  | 10.0    | Radius in blocks around the player                         |
| `speed`                  | 0.6     | Blocks per tick a pulled item travels (0.6 = 12 blocks/s)  |
| `pullExperienceOrbs`     | true    | Also pull experience orbs                                  |
| `ownDropCooldownSeconds` | 10      | Grace period for items you dropped yourself (0 = none)     |

## Crafting

Five iron ingots in a horseshoe, an ender pearl in the middle and redstone underneath:

```
[Iron ]  [     ]  [Iron ]
[Iron ]  [Pearl]  [Iron ]
[     ]  [Redst]  [     ]
```

The magnet does not stack and never wears out.

## Building

You need JDK 25 on your machine (or let Gradle download one: the build uses the Foojay toolchain resolver).

```
./gradlew build          # Linux/macOS
gradlew.bat build        # Windows (PowerShell: .\gradlew.bat build)
```

The mod jar is written to `build/libs/magnet-forge-26.3-1.0.0.jar`. Drop it into the `mods` folder of a
Forge 66.0.4 (Minecraft 26.3) installation. `./gradlew runClient` starts a development client.

The first build downloads Minecraft, Forge and the ForgeGradle toolchain, so it needs internet access.

## Project layout

```
build.gradle, settings.gradle, gradle.properties   Forge 26.3 MDK-style build (versions live in gradle.properties)
src/main/java/com/onetruespec/magnet/
    MagnetMod.java           mod entry point: registers the item, the "active" data component, creative tab, config
    MagnetItem.java          toggle on right-click; per-tick pull of items and experience orbs
    MagnetConfig.java        the config/magnet-common.toml settings
src/main/resources/
    META-INF/mods.toml       mod metadata (placeholders expanded by Gradle)
    pack.mcmeta              resource/data pack metadata
    assets/magnet/           item definition, model, texture, en_us translations
    data/magnet/             crafting recipe and its recipe-book unlock advancement
```

## License

MIT.
