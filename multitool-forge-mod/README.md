# Multi-Tool (Forge, Minecraft 26.3)

A pickaxe, an axe and a shovel in a single tool. One multi-tool exists for every vanilla tool material:
wooden, stone, copper, iron, golden, diamond and netherite.

| Target            | Version                                   |
|-------------------|-------------------------------------------|
| Minecraft         | 26.3                                      |
| Minecraft Forge   | 66.0.4 (`loaderVersion` / dependency `[66,)`) |
| Java              | 25 (what Mojang ships with 26.1+)         |
| Build tool        | Gradle 9.7.1 wrapper + ForgeGradle 7      |

## What the multi-tool does

* **Mines everything the three tools mine.** It breaks and drops every block tagged `#minecraft:mineable/pickaxe`,
  `#minecraft:mineable/axe` or `#minecraft:mineable/shovel` at the mining speed of its material, and it keeps the
  vanilla harvest levels (a stone multi-tool still cannot mine diamond ore).
* **Right-click like an axe and a shovel.** Strips logs and wood, scrapes oxidation and wax off copper blocks,
  turns grass/dirt into dirt paths and puts out campfires.
* **Fights like an axe.** Same attack damage and attack speed as the axe of the same material, and it disables
  shields for the same duration.
* **Twice the durability** of a single tool of the same material (for example 3122 for diamond, 4062 for netherite).
* **Enchants, repairs and upgrades like the vanilla tools.** Efficiency, Fortune, Silk Touch, Unbreaking, Mending and
  the axe weapon enchantments all apply. Repair it in an anvil with the material's repair item. Upgrade the diamond
  multi-tool to netherite in a smithing table with a Netherite Upgrade template and a netherite ingot.
* It appears in the **Tools & Utilities** creative tab next to the vanilla tools, and it is tagged as a pickaxe,
  axe and shovel (`#minecraft:pickaxes`, `#minecraft:axes`, `#minecraft:shovels`, plus the common
  `#c:tools/mining_tool` and `#c:tools/melee_weapon` tags) so other mods treat it as all three.

## Crafting

Combine the pickaxe, axe and shovel of one material with two sticks (same for every material):

```
[Pickaxe] [Axe] [Shovel]
[      ] [Stick] [      ]
[      ] [Stick] [      ]
```

Netherite can also be made the vanilla way: smithing table, Netherite Upgrade template, diamond multi-tool,
netherite ingot.

## Building

You need JDK 25 on your machine (or let Gradle download one: the build uses the Foojay toolchain resolver).

```
./gradlew build          # Linux/macOS
gradlew.bat build        # Windows
```

The mod jar is written to `build/libs/multitool-forge-26.3-1.0.0.jar`. Drop it into the `mods` folder of a
Forge 66.0.4 (Minecraft 26.3) installation.

To run a development client or server straight from the sources:

```
./gradlew runClient
./gradlew runServer
```

The first build downloads Minecraft, Forge and the ForgeGradle toolchain from `maven.minecraftforge.net` and
Mojang's servers, so it needs internet access.

## Project layout

```
build.gradle, settings.gradle, gradle.properties   Forge 26.3 MDK-style build (versions live in gradle.properties)
src/main/java/com/onetruespec/multitool/
    MultiToolMod.java        mod entry point, registers items and the creative-tab listener
    MultiToolItem.java       the item: TOOL component for all three block families, axe/shovel right-click
    MultiToolItems.java      the seven registered items (one per material) and creative-tab placement
src/main/resources/
    META-INF/mods.toml       mod metadata (placeholders expanded by Gradle)
    pack.mcmeta              resource/data pack metadata
    assets/multitool/        item model definitions, models, textures, en_us translations
    data/multitool/          crafting + smithing recipes and their recipe-book unlock advancements
    data/minecraft/tags/     adds the multi-tools to #pickaxes, #axes, #shovels, #cluster_max_harvestables
    data/c/tags/             adds them to the common #c:tools/mining_tool and #c:tools/melee_weapon tags
```

## License

MIT.
