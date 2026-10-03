package com.onetruespec.invsorter;

import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.config.ModConfig;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;

/**
 * Inventory Sorter: press the Pick Block key (middle mouse by default) over any slot of your inventory or of an
 * open container to sort and stack that inventory.
 *
 * <p>The client ({@link SorterClient}) only sends a {@link SortPacket}; the server ({@link InventorySorter})
 * does the actual sorting, so it works in single-player and on servers alike, and it cannot be used to duplicate
 * items. Both sides need the mod for sorting to work, but neither side refuses to connect without it.
 */
@Mod(InventorySorterMod.MOD_ID)
public final class InventorySorterMod {
    /** The mod id; must match {@code META-INF/mods.toml}. */
    public static final String MOD_ID = "invsorter";

    public InventorySorterMod(FMLJavaModLoadingContext context) {
        // Register the network channel while mod loading is still open for channel registration.
        SorterNetwork.init();

        context.registerConfig(ModConfig.Type.CLIENT, SorterConfig.SPEC);
    }
}
