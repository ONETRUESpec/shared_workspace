# Inventory Sorter (Forge, Minecraft 26.3)

One click sorts and stacks your inventory or any chest.

| Target            | Version                                   |
|-------------------|-------------------------------------------|
| Minecraft         | 26.3                                      |
| Minecraft Forge   | 66.0.4 (`loaderVersion` / dependency `[66,)`) |
| Java              | 25 (what Mojang ships with 26.1+)         |
| Build tool        | Gradle 9.7.1 wrapper + ForgeGradle 7      |

## How to use

* Open your inventory or any container and **middle-click a slot**. The whole inventory that slot belongs to is
  sorted: click a chest slot to sort the chest, click one of your own slots to sort your inventory.
* The trigger is Minecraft's **Pick Block** key, so if you rebind Pick Block (Options > Controls) the sorter follows.
* In **creative mode** middle-click already clones items, so hold **Shift** while middle-clicking to sort instead.
  The creative inventory screen itself cannot be sorted; use the inventory half of any chest screen.
* Sorting merges stacks of the same item, then orders them: blocks first, then items, alphabetically by id, least
  damaged first, fullest stack first. Nothing is ever created or lost: the item count is checked before anything
  is written.
* Your **hotbar is left alone** by default. Set `includeHotbar = true` in `config/invsorter-client.toml` to sort
  it together with the main inventory. Armour and off-hand slots are never touched.
* Works on chests, double chests, barrels, shulker boxes, ender chests, hoppers, dispensers, droppers and other
  containers whose slots accept any item. Furnaces, brewing stands, anvils and similar menus with special slots are
  deliberately left alone.

## Multiplayer

Sorting is done by the server, so the mod has to be installed on both the client and the server. It does not
block connections: a client with the mod can join a server without it (middle-click then does nothing), and a
client without it can join a server that has it.

## Building

You need JDK 25 on your machine (or let Gradle download one: the build uses the Foojay toolchain resolver).

```
./gradlew build          # Linux/macOS
gradlew.bat build        # Windows (PowerShell: .\gradlew.bat build)
```

The mod jar is written to `build/libs/invsorter-forge-26.3-1.0.0.jar`. Drop it into the `mods` folder of a
Forge 66.0.4 (Minecraft 26.3) installation. `./gradlew runClient` starts a development client.

The first build downloads Minecraft, Forge and the ForgeGradle toolchain, so it needs internet access.

## Project layout

```
build.gradle, settings.gradle, gradle.properties   Forge 26.3 MDK-style build (versions live in gradle.properties)
src/main/java/com/onetruespec/invsorter/
    InventorySorterMod.java   mod entry point: creates the network channel, registers the client config
    SorterClient.java         client only: Pick Block in a container screen -> sends SortPacket
    SortPacket.java           the client-to-server message (slot index, include hotbar)
    SorterNetwork.java        the Forge SimpleChannel; optional on both sides
    InventorySorter.java      server-side merge/sort/write-back of the open menu's slots
    SorterConfig.java         config/invsorter-client.toml (includeHotbar)
src/main/resources/
    META-INF/mods.toml        mod metadata (placeholders expanded by Gradle)
    pack.mcmeta               resource/data pack metadata
```

## License

MIT.
