# Big Stacks (Forge, Minecraft 26.3)

Items stack up to **500** in your own inventory. Chests and every other container keep their normal stack sizes.

| Target            | Version                                   |
|-------------------|-------------------------------------------|
| Minecraft         | 26.3                                      |
| Minecraft Forge   | 66.0.4 (`loaderVersion` / dependency `[66,)`) |
| Java              | 25 (what Mojang ships with 26.1+)         |
| Build tool        | Gradle 9.7.1 wrapper + ForgeGradle 7      |

## What changes

* Hotbar, main inventory and off-hand slots hold up to 500 of any stackable item (dirt, cobblestone, arrows,
  ender pearls, buckets...). Items that never stack, such as tools, armour and potions, still do not.
* Picking items up, shift-clicking out of a chest, and clicking stacks together in your inventory all fill up to
  the limit. Dropping a stack drops all of it as one pile.
* Chests, barrels, shulker boxes, hoppers, furnaces, dispensers and so on are untouched: moving a 500-stack into a
  chest fills chest slots with 64 each. Armour slots still take one item.
* The limit is a per-world setting: `inventoryStackSize` (64 to 9999, default 500) in
  `saves/<world>/serverconfig/bigstacks-server.toml`, or `world/serverconfig/` on a server. Servers send the value
  to joining players.
* Multiplayer: the mod is needed on the server and on every client.

## How it is built, and the safety net

Minecraft enforces the 64/99 limits in a few places in its own code, so this mod uses Mixins (small patches
applied when the game starts):

| Patch                          | Purpose                                                                      |
|--------------------------------|------------------------------------------------------------------------------|
| `InventoryMixin`               | The player inventory reports the configured limit instead of vanilla's 99     |
| `SlotMixin`                    | Menu slots that belong to a player inventory accept that many; other slots unchanged |
| `AbstractContainerMenuMixin`   | Shift-click merging may fill inventory stacks up to the limit                 |
| `ServerGamePacketListenerImplMixin` | The server accepts big stacks edited in the creative inventory             |
| `ExtraCodecsMixin`             | The item save format accepts counts above 99                                  |

The last one is the only patch that could lose items if it ever stopped matching a future Minecraft version, so
the mod checks, the first time a stack limit is needed (your first pickup or click in an inventory; item data is
not available during mod loading on 26.3, so it cannot run at startup), that a big stack survives a save/load
round trip. If that check fails, it logs an error and limits new inventory stacks to 99 (which vanilla can always
save) instead of 500. Look for the log line starting with "Big Stacks:" after you first pick up or move an item.

### Before removing or updating the mod

Stacks above 99 exist only while this mod's save-format patch is active. If a world is opened without Big Stacks
(mod removed, world loaded in vanilla, or a Minecraft/Forge update on which the patch no longer applies and the
log shows the "still rejects stacks above 99" error), every inventory stack and every dropped pile above 99 is
dropped on load, with only a line in the log. Before removing or updating, split such stacks down to 99 or fewer
(64 to be safe) and put them in chests.

## Building

You need JDK 25 on your machine (or let Gradle download one: the build uses the Foojay toolchain resolver).

```
./gradlew build          # Linux/macOS
gradlew.bat build        # Windows (PowerShell: .\gradlew.bat build)
```

The mod jar is written to `build/libs/bigstacks-forge-26.3-1.0.0.jar`. Drop it into the `mods` folder of a
Forge 66.0.4 (Minecraft 26.3) installation. `./gradlew runClient` starts a development client.

The first build downloads Minecraft, Forge and the ForgeGradle toolchain, so it needs internet access.

## Project layout

```
build.gradle, settings.gradle, gradle.properties   Forge 26.3 MDK-style build plus the Mixin wiring from Forge's MDKExamples
src/main/java/com/onetruespec/bigstacks/
    BigStacksMod.java         mod entry point: registers the per-world (server) config
    BigStacks.java            the limit rules used by the mixins, the save-format self-test and the 99 fallback
    BigStacksConfig.java      inventoryStackSize setting
    mixin/                    the five Mixins described above
src/main/resources/
    bigstacks.mixins.json     Mixin config (also named in the jar manifest)
    META-INF/mods.toml        mod metadata (placeholders expanded by Gradle)
    pack.mcmeta               resource/data pack metadata
```

## License

MIT.
