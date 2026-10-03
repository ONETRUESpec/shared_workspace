package com.onetruespec.bigstacks;

import com.mojang.logging.LogUtils;
import com.mojang.serialization.DataResult;

import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.config.ModConfig;
import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import org.slf4j.Logger;

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
 *   <li>{@code ItemStackMixin} raises the "count must be between 1 and 99" limit of the item save format, so
 *       the big stacks survive saving and loading.</li>
 * </ul>
 * The last point is the one that could lose items if it ever stopped applying on a new Minecraft version, so
 * {@link #commonSetup} proves it works at startup and otherwise falls back to 99, which vanilla can always save.
 */
@Mod(BigStacksMod.MOD_ID)
public final class BigStacksMod {
    /** The mod id; must match {@code META-INF/mods.toml} and {@code bigstacks.mixins.json}. */
    public static final String MOD_ID = "bigstacks";
    private static final Logger LOGGER = LogUtils.getLogger();

    public BigStacksMod(FMLJavaModLoadingContext context) {
        FMLCommonSetupEvent.getBus(context.getModBusGroup()).addListener(BigStacksMod::commonSetup);

        // A server config: lives with the world and is sent to clients when they join, so both sides agree.
        context.registerConfig(ModConfig.Type.SERVER, BigStacksConfig.SPEC);
    }

    /** Checks that a stack bigger than vanilla's 99 survives a round trip through the item save format. */
    private static void commonSetup(FMLCommonSetupEvent event) {
        boolean supported = false;
        try {
            ItemStack probe = new ItemStack(Items.DIRT, BigStacksConfig.MAX_LIMIT);
            DataResult<Tag> encoded = ItemStack.CODEC.encodeStart(NbtOps.INSTANCE, probe);
            if (encoded.result().isPresent()) {
                DataResult<ItemStack> decoded = ItemStack.CODEC.parse(NbtOps.INSTANCE, encoded.result().get());
                supported = decoded.result().isPresent() && decoded.result().get().getCount() == BigStacksConfig.MAX_LIMIT;
            }
        } catch (RuntimeException e) {
            LOGGER.error("Big Stacks: self-test of the item save format threw", e);
        }
        BigStacks.setBigCountsSerializable(supported);
        if (supported) {
            LOGGER.info("Big Stacks: item save format accepts big stacks; inventory stacks go up to the configured limit.");
        } else {
            LOGGER.error("Big Stacks: the item save format still rejects stacks above 99 (the ItemStack mixin did not apply on this Minecraft version). Inventory stacks are limited to 99 so nothing can be lost on save.");
        }
    }
}
