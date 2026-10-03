package com.onetruespec.magnet;

import net.minecraftforge.common.ForgeConfigSpec;

/**
 * Settings written to {@code config/magnet-common.toml}. Values are read live and Forge watches the file, so saving
 * an edit takes effect within a few seconds without a restart ({@code /reload} is not involved; it only reloads data
 * packs). Edits made while the game is closed are picked up on the next start.
 */
public final class MagnetConfig {
    public static final ForgeConfigSpec SPEC;

    /** Radius (in blocks) around the player from which items are pulled. */
    public static final ForgeConfigSpec.DoubleValue RANGE;
    /** How far (in blocks) a pulled item moves per tick; 20 ticks make a second. */
    public static final ForgeConfigSpec.DoubleValue SPEED;
    /** Whether experience orbs are pulled as well. */
    public static final ForgeConfigSpec.BooleanValue PULL_EXPERIENCE_ORBS;
    /** Items a player dropped themselves are ignored for this many seconds, so throwing something away still works. */
    public static final ForgeConfigSpec.IntValue OWN_DROP_COOLDOWN_SECONDS;

    static {
        ForgeConfigSpec.Builder builder = new ForgeConfigSpec.Builder();

        builder.comment("Magnet settings").push("magnet");

        RANGE = builder
            .comment("Radius in blocks around the player from which dropped items are pulled in.")
            .defineInRange("range", 10.0D, 1.0D, 64.0D);

        SPEED = builder
            .comment("How many blocks a pulled item travels per game tick (20 ticks = 1 second).")
            .defineInRange("speed", 0.6D, 0.05D, 5.0D);

        PULL_EXPERIENCE_ORBS = builder
            .comment("Also pull experience orbs towards the player.")
            .define("pullExperienceOrbs", true);

        OWN_DROP_COOLDOWN_SECONDS = builder
            .comment("Items the player dropped themselves (Q key) are left alone for this many seconds,",
                     "so you can still throw things away while the magnet is active. 0 disables the grace period.")
            .defineInRange("ownDropCooldownSeconds", 10, 0, 600);

        builder.pop();

        SPEC = builder.build();
    }

    private MagnetConfig() {
    }
}
