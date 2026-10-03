package com.onetruespec.bigstacks;

import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.config.ModConfig;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;

/**
 * Big Stacks: items stack far beyond 64 in the player's own inventory (500 by default, configurable per world),
 * while chests and every other container keep their normal stack sizes.
 *
 * <p>How it works, in order of what the game asks:
 * <ul>
 *   <li>{@code InventoryMixin} makes the player inventory report the configured limit instead of vanilla's 99.</li>
 *   <li>{@code SlotMixin} makes menu slots that belong to a player inventory accept that many, while slots of
 *       chests, hoppers, furnaces and so on are untouched; armour slots keep their limit of one.</li>
 *   <li>{@code AbstractContainerMenuMixin} lets shift-clicking fill inventory stacks up to the limit (Forge caps
 *       that path at the item's own stack size).</li>
 *   <li>{@code ExtraCodecsMixin} raises the "count must be between 1 and 99" limit of the item save format, so
 *       the big stacks survive saving and loading.</li>
 * </ul>
 * The last point is the one that could lose items if it ever stopped applying on a new Minecraft version, so
 * {@link BigStacks} proves it works (a save/load round trip of a big stack, run the first time a limit is needed)
 * and otherwise falls back to 99, which vanilla can always save.
 */
@Mod(BigStacksMod.MOD_ID)
public final class BigStacksMod {
    /** The mod id; must match {@code META-INF/mods.toml} and {@code bigstacks.mixins.json}. */
    public static final String MOD_ID = "bigstacks";

    public BigStacksMod(FMLJavaModLoadingContext context) {
        // A server config: lives with the world and is sent to clients when they join, so both sides agree.
        context.registerConfig(ModConfig.Type.SERVER, BigStacksConfig.SPEC);
    }
}
