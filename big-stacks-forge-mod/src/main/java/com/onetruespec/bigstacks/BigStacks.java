package com.onetruespec.bigstacks;

import net.minecraft.world.item.ItemStack;

/** The one place that decides how big a stack may get in a player inventory. Used by the mixins. */
public final class BigStacks {
    /** Vanilla's hard limit for a saved stack count; the fallback when the save format could not be widened. */
    public static final int VANILLA_LIMIT = 99;

    /** What the item save format accepts once {@code ExtraCodecsMixin} has widened it (vanilla: 99). */
    public static final int SERIALIZED_COUNT_LIMIT = 1_000_000;

    private static volatile boolean bigCountsSerializable;

    private BigStacks() {
    }

    static void setBigCountsSerializable(boolean serializable) {
        bigCountsSerializable = serializable;
    }

    /** The stack limit of a player inventory slot, before looking at the item. */
    public static int inventoryLimit() {
        int configured = BigStacksConfig.SPEC.isLoaded() ? BigStacksConfig.INVENTORY_STACK_SIZE.get() : BigStacksConfig.DEFAULT_LIMIT;
        return bigCountsSerializable ? configured : Math.min(configured, VANILLA_LIMIT);
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
}
