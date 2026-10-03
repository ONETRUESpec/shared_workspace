package com.onetruespec.invsorter;

import net.minecraftforge.common.ForgeConfigSpec;

/** Client-side settings, written to {@code config/invsorter-client.toml}. Forge reloads the file when it is saved. */
public final class SorterConfig {
    public static final ForgeConfigSpec SPEC;

    /** Whether sorting the player's inventory also rearranges the hotbar. Off by default: most people lay it out by hand. */
    public static final ForgeConfigSpec.BooleanValue INCLUDE_HOTBAR;

    static {
        ForgeConfigSpec.Builder builder = new ForgeConfigSpec.Builder();
        builder.comment("Inventory Sorter settings").push("sorting");
        INCLUDE_HOTBAR = builder
            .comment("Also sort the hotbar when sorting your own inventory. Off keeps your hotbar exactly as you arranged it.")
            .define("includeHotbar", false);
        builder.pop();
        SPEC = builder.build();
    }

    private SorterConfig() {
    }
}
