# Compressed Blocks (Forge, Minecraft 26.3)

Craft nine blocks into one compressed block, nine compressed blocks into a double compressed block, and so on,
up to nine levels deep. A nonuple compressed block holds 9^9 = 387,420,489 of the original block.

| Target            | Version                                   |
|-------------------|-------------------------------------------|
| Minecraft         | 26.3                                      |
| Minecraft Forge   | 66.0.4 (`loaderVersion` / dependency `[66,)`) |
| Java              | 25 (what Mojang ships with 26.1+)         |
| Build tool        | Gradle 9.7.1 wrapper + ForgeGradle 7      |

## Blocks

Eleven vanilla blocks can be compressed, nine tiers each (99 blocks in total):

dirt, cobblestone, stone, cobbled deepslate, sand, gravel, netherrack, end stone, granite, diorite, andesite.

Tier names: Compressed, Double Compressed, Triple, Quadruple, Quintuple, Sextuple, Septuple, Octuple, Nonuple.
Registry ids follow `compressedblocks:compressed_<block>_<tier>`, for example `compressedblocks:compressed_dirt_3`
for Triple Compressed Dirt.

Compressed blocks look like the original block with a coloured frame and the tier number on every face, so you can
always tell them apart (6 and 9 carry an underline so they cannot be confused on the top and bottom faces). They
sound like and map like the original, get harder and more blast resistant with every tier (vanilla strength times
tier + 1), need the same tool as the original to drop (shovel blocks drop without a tool, stone-type blocks need a
pickaxe), and compressed sand and gravel do not fall. If one does get blown up, it always drops itself, like a
shulker box, rather than taking vanilla's one-in-three chance of vanishing. They all have their own creative tab,
"Compressed Blocks", right after Combat.

## Crafting

* **Compress:** fill the 3x3 crafting grid with nine of the same block (or nine of the same compressed block) to get
  the next tier.
* **Uncompress:** put one compressed block anywhere in a crafting grid to get nine of the tier below.

Both directions are in the recipe book once you have the ingredient.

## Building

You need JDK 25 on your machine (or let Gradle download one: the build uses the Foojay toolchain resolver).

```
./gradlew build          # Linux/macOS
gradlew.bat build        # Windows (PowerShell: .\gradlew.bat build)
```

The mod jar is written to `build/libs/compressedblocks-forge-26.3-1.0.0.jar`. Drop it into the `mods` folder of a
Forge 66.0.4 (Minecraft 26.3) installation. `./gradlew runClient` starts a development client.

The first build downloads Minecraft, Forge and the ForgeGradle toolchain, so it needs internet access.

## Adding blocks or tiers

All models, loot tables, recipes, advancements, tags, translations and overlay textures are generated, not written
by hand:

1. Add the block to the `BASES` table in both `src/main/java/com/onetruespec/compressedblocks/CompressedBlocks.java`
   (sound, map colour, strength, tool requirement) and `tools/generate_resources.py` (display name, vanilla texture,
   tool tag). Change `TIERS` in both files to change the depth.
2. Run `python3 tools/generate_resources.py` from the mod folder (Python 3, no extra packages needed).
3. Rebuild.

## Project layout

```
build.gradle, settings.gradle, gradle.properties   Forge 26.3 MDK-style build (versions live in gradle.properties)
tools/generate_resources.py                         generator for everything under src/main/resources except mods.toml/pack.mcmeta
src/main/java/com/onetruespec/compressedblocks/
    CompressedBlocksMod.java   mod entry point, registers blocks, items and the creative tab
    CompressedBlocks.java      the base-block table, block/item registration, creative tab
src/main/resources/
    META-INF/mods.toml         mod metadata (placeholders expanded by Gradle)
    pack.mcmeta                resource/data pack metadata
    assets/compressedblocks/   blockstates, block models (vanilla texture + tier overlay), item definitions, textures, lang
    data/compressedblocks/     loot tables, compress/uncompress recipes and their recipe-book advancements
    data/minecraft/tags/       adds the blocks to #minecraft:mineable/shovel and #minecraft:mineable/pickaxe
```

## License

MIT.
