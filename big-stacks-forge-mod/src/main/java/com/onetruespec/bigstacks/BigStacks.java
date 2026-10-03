package com.onetruespec.bigstacks;

import com.mojang.logging.LogUtils;
import com.mojang.serialization.DataResult;

import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import org.slf4j.Logger;

/** The one place that decides how big a stack may get in a player inventory. Used by the mixins. */
public final class BigStacks {
    private static final Logger LOGGER = LogUtils.getLogger();

    /** Vanilla's hard limit for a saved stack count; the fallback when the save format could not be widened. */
    public static final int VANILLA_LIMIT = 99;

    /** What the item save format accepts once {@code ExtraCodecsMixin} has widened it (vanilla: 99). */
    public static final int SERIALIZED_COUNT_LIMIT = 1_000_000;

    /**
     * Result of the save-format self-test: null until it has run successfully once. It cannot run during mod
     * loading (item data is not bound to the registry yet), so it runs the first time a limit is asked for,
     * which only happens once inventories are in use.
     */
    private static volatile Boolean bigCountsSerializable;
    private static boolean warnedAboutEarlyProbe;

    private BigStacks() {
    }

    /** The stack limit of a player inventory slot, before looking at the item. */
    public static int inventoryLimit() {
        int configured = BigStacksConfig.SPEC.isLoaded() ? BigStacksConfig.INVENTORY_STACK_SIZE.get() : BigStacksConfig.DEFAULT_LIMIT;
        return bigCountsSerializable() ? configured : Math.min(configured, VANILLA_LIMIT);
    }

    /**
     * The stack limit of the given item in a player inventory: unstackable items (tools, armour, potions...) stay
     * at one, everything else goes up to {@link #inventoryLimit()} or the item's own limit if that is higher.
     */
    public static int limitFor(ItemStack stack) {
        int itemLimit = stack.getMaxStackSize();
        if (itemLimit <= 1) {
            return itemLimit;
        }
        return Math.max(itemLimit, inventoryLimit());
    }

    /** Whether a stack bigger than 99 survives the item save format; proven by a round trip, cached once known. */
    private static boolean bigCountsSerializable() {
        Boolean known = bigCountsSerializable;
        if (known != null) {
            return known;
        }
        synchronized (BigStacks.class) {
            if (bigCountsSerializable != null) {
                return bigCountsSerializable;
            }
            try {
                boolean supported = roundTripSucceeds(BigStacksConfig.MAX_LIMIT);
                bigCountsSerializable = supported;
                if (supported) {
                    LOGGER.info("Big Stacks: item save format accepts big stacks; inventory stacks go up to the configured limit.");
                } else {
                    LOGGER.error("Big Stacks: the item save format still rejects stacks above 99 (the ExtraCodecs mixin did not apply on this Minecraft version). Inventory stacks are limited to 99 so nothing can be lost on save.");
                }
                return supported;
            } catch (RuntimeException e) {
                // Typically "Components not bound yet": asked before item data exists. Stay on the safe limit
                // for now and try again on the next call instead of remembering a wrong answer.
                if (!warnedAboutEarlyProbe) {
                    warnedAboutEarlyProbe = true;
                    LOGGER.warn("Big Stacks: could not test the item save format yet ({}); using the vanilla limit until it can be tested.", e.toString());
                }
                return false;
            }
        }
    }

    private static boolean roundTripSucceeds(int count) {
        ItemStack probe = new ItemStack(Items.DIRT, count);
        DataResult<Tag> encoded = ItemStack.CODEC.encodeStart(NbtOps.INSTANCE, probe);
        if (encoded.result().isEmpty()) {
            return false;
        }
        DataResult<ItemStack> decoded = ItemStack.CODEC.parse(NbtOps.INSTANCE, encoded.result().get());
        return decoded.result().isPresent() && decoded.result().get().getCount() == count;
    }
}
