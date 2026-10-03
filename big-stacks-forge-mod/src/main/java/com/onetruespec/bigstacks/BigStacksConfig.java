package com.onetruespec.bigstacks;

import net.minecraftforge.common.ForgeConfigSpec;

/**
 * Per-world settings in {@code saves/<world>/serverconfig/bigstacks-server.toml} (on a server:
 * {@code world/serverconfig/}). Forge sends them to every client that joins.
 */
public final class BigStacksConfig {
    public static final int DEFAULT_LIMIT = 500;
    public static final int MAX_LIMIT = 9999;

    public static final ForgeConfigSpec SPEC;
    /** How many of a stackable item fit in one player inventory slot. */
    public static final ForgeConfigSpec.IntValue INVENTORY_STACK_SIZE;

    static {
        ForgeConfigSpec.Builder builder = new ForgeConfigSpec.Builder();
        builder.comment("Big Stacks settings").push("inventory");
        INVENTORY_STACK_SIZE = builder
            .comment("How many of a stackable item fit in one slot of a player's inventory (hotbar, main inventory, off-hand).",
                     "Chests and other containers are not affected. Items that never stack (tools, armour, potions) still do not.")
            .defineInRange("inventoryStackSize", DEFAULT_LIMIT, 64, MAX_LIMIT);
        builder.pop();
        SPEC = builder.build();
    }

    private BigStacksConfig() {
    }
}
