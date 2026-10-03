package com.onetruespec.compressedblocks;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.material.MapColor;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Declares every compressed block: one block per base block and compression tier, its block item, and the
 * creative tab that lists them all.
 *
 * <p>Compressed blocks are plain full cubes that sound and map like their base block, do not fall like sand or
 * gravel, and get harder and more blast resistant with every tier (base strength times {@code tier + 1}).
 */
public final class CompressedBlocks {
    /** How many times a block can be compressed. Nine tiers of nine means the top tier holds 9^9 base blocks. */
    public static final int TIERS = 9;

    /**
     * A vanilla block that can be compressed.
     *
     * @param id           the vanilla block's path, also used in the compressed block's registry name
     * @param sound        the sound group of the vanilla block
     * @param color        the map colour of the vanilla block
     * @param hardness     the vanilla block's destroy time, before the per-tier scaling
     * @param resistance   the vanilla block's explosion resistance, before the per-tier scaling
     * @param requiresTool whether the compressed blocks need the right tool (a pickaxe) to drop, like the vanilla block
     */
    public record Base(String id, SoundType sound, MapColor color, float hardness, float resistance, boolean requiresTool) {
    }

    /** Keep in step with the BASES table in tools/generate_resources.py. */
    public static final List<Base> BASES = List.of(
        new Base("dirt", SoundType.GRAVEL, MapColor.DIRT, 0.5F, 0.5F, false),
        new Base("cobblestone", SoundType.STONE, MapColor.STONE, 2.0F, 6.0F, true),
        new Base("stone", SoundType.STONE, MapColor.STONE, 1.5F, 6.0F, true),
        new Base("cobbled_deepslate", SoundType.DEEPSLATE, MapColor.DEEPSLATE, 3.5F, 6.0F, true),
        new Base("sand", SoundType.SAND, MapColor.SAND, 0.5F, 0.5F, false),
        new Base("gravel", SoundType.GRAVEL, MapColor.STONE, 0.6F, 0.6F, false),
        new Base("netherrack", SoundType.NETHERRACK, MapColor.NETHER, 0.4F, 0.4F, true),
        new Base("end_stone", SoundType.STONE, MapColor.SAND, 3.0F, 9.0F, true),
        new Base("granite", SoundType.STONE, MapColor.DIRT, 1.5F, 6.0F, true),
        new Base("diorite", SoundType.STONE, MapColor.QUARTZ, 1.5F, 6.0F, true),
        new Base("andesite", SoundType.STONE, MapColor.STONE, 1.5F, 6.0F, true)
    );

    public static final DeferredRegister<Block> BLOCKS = DeferredRegister.create(ForgeRegistries.BLOCKS, CompressedBlocksMod.MOD_ID);
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, CompressedBlocksMod.MOD_ID);
    public static final DeferredRegister<CreativeModeTab> CREATIVE_MODE_TABS = DeferredRegister.create(Registries.CREATIVE_MODE_TAB, CompressedBlocksMod.MOD_ID);

    /** Every compressed block, base by base and tier 1 to {@link #TIERS}; this is also the creative tab order. */
    public static final List<RegistryObject<Block>> ALL_BLOCKS;
    /** The block items, in the same order as {@link #ALL_BLOCKS}. */
    public static final List<RegistryObject<Item>> ALL_ITEMS;
    private static final Map<String, RegistryObject<Item>> ITEMS_BY_NAME = new HashMap<>();

    static {
        List<RegistryObject<Block>> blocks = new ArrayList<>();
        List<RegistryObject<Item>> items = new ArrayList<>();
        for (Base base : BASES) {
            for (int tier = 1; tier <= TIERS; tier++) {
                String name = name(base.id(), tier);
                float strengthMultiplier = tier + 1;
                RegistryObject<Block> block = BLOCKS.register(name, () -> new Block(properties(base, strengthMultiplier, name)));
                RegistryObject<Item> item = ITEMS.register(name, () -> new BlockItem(block.get(), new Item.Properties().setId(ITEMS.key(name))));
                blocks.add(block);
                items.add(item);
                ITEMS_BY_NAME.put(name, item);
            }
        }
        ALL_BLOCKS = List.copyOf(blocks);
        ALL_ITEMS = List.copyOf(items);
    }

    /** The "Compressed Blocks" creative tab, placed after the Combat tab. */
    public static final RegistryObject<CreativeModeTab> TAB = CREATIVE_MODE_TABS.register("compressed_blocks", () -> CreativeModeTab.builder()
        .withTabsBefore(CreativeModeTabs.COMBAT)
        .title(Component.translatable("itemGroup." + CompressedBlocksMod.MOD_ID))
        .icon(() -> item("cobblestone", TIERS).get().getDefaultInstance())
        .displayItems((parameters, output) -> {
            for (RegistryObject<Item> item : ALL_ITEMS) {
                output.accept(item.get());
            }
        })
        .build());

    private CompressedBlocks() {
    }

    /** Registry name of a compressed block, for example {@code compressed_dirt_3} for triple compressed dirt. */
    public static String name(String baseId, int tier) {
        return "compressed_" + baseId + "_" + tier;
    }

    /** The block item of the given base block and tier, for example {@code item("dirt", 1)} for compressed dirt. */
    public static RegistryObject<Item> item(String baseId, int tier) {
        return ITEMS_BY_NAME.get(name(baseId, tier));
    }

    private static BlockBehaviour.Properties properties(Base base, float strengthMultiplier, String name) {
        BlockBehaviour.Properties properties = BlockBehaviour.Properties.of()
            .setId(BLOCKS.key(name))
            .mapColor(base.color())
            .sound(base.sound())
            .strength(base.hardness() * strengthMultiplier, base.resistance() * strengthMultiplier);
        if (base.requiresTool()) {
            properties.requiresCorrectToolForDrops();
        }
        return properties;
    }
}
