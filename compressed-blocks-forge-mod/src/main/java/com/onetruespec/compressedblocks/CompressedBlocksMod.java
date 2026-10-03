package com.onetruespec.compressedblocks;

import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;

/**
 * Compressed Blocks: craft nine of a block into one compressed block, and nine compressed blocks into a double
 * compressed one, and so on up to {@value CompressedBlocks#TIERS} levels. Works for dirt, cobblestone, stone,
 * cobbled deepslate, sand, gravel, netherrack, end stone, granite, diorite and andesite.
 *
 * <p>The blocks, items and the creative tab are declared in {@link CompressedBlocks}. All models, loot tables,
 * recipes, tags and translations under {@code src/main/resources} are produced by {@code tools/generate_resources.py},
 * which must be kept in step with the block list in {@link CompressedBlocks#BASES}.
 */
@Mod(CompressedBlocksMod.MOD_ID)
public final class CompressedBlocksMod {
    /** The mod id; must match {@code META-INF/mods.toml} and the resource/data namespace. */
    public static final String MOD_ID = "compressedblocks";

    public CompressedBlocksMod(FMLJavaModLoadingContext context) {
        var modBusGroup = context.getModBusGroup();

        CompressedBlocks.BLOCKS.register(modBusGroup);
        CompressedBlocks.ITEMS.register(modBusGroup);
        CompressedBlocks.CREATIVE_MODE_TABS.register(modBusGroup);
    }
}
