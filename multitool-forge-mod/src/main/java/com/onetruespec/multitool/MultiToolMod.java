package com.onetruespec.multitool;

import net.minecraftforge.event.BuildCreativeModeTabContentsEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;

/**
 * Multi-Tool: a pickaxe, an axe and a shovel in one item, available for every vanilla tool material.
 *
 * <p>Everything this mod does is data-driven apart from the {@link MultiToolItem} class: the items are
 * registered in {@link MultiToolItems}, while recipes, tags, models and translations live under
 * {@code src/main/resources}.
 */
@Mod(MultiToolMod.MOD_ID)
public final class MultiToolMod {
    /** The mod id; must match {@code META-INF/mods.toml} and the resource/data namespace. */
    public static final String MOD_ID = "multitool";

    public MultiToolMod(FMLJavaModLoadingContext context) {
        var modBusGroup = context.getModBusGroup();

        // Register the items on the mod bus so they are added during the Item RegisterEvent.
        MultiToolItems.ITEMS.register(modBusGroup);

        // Place the multi-tools next to the vanilla tools in the creative inventory.
        BuildCreativeModeTabContentsEvent.BUS.addListener(MultiToolItems::addToCreativeTabs);
    }
}
