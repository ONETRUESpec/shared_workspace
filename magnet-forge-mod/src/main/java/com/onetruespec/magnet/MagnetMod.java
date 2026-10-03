package com.onetruespec.magnet;

import com.mojang.serialization.Codec;

import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraftforge.event.BuildCreativeModeTabContentsEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.config.ModConfig;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Magnet: a toggleable item that pulls dropped items (and experience orbs) towards the player who carries it.
 *
 * <p>The range, pull speed and the other knobs live in {@code config/magnet-common.toml}, see {@link MagnetConfig}.
 */
@Mod(MagnetMod.MOD_ID)
public final class MagnetMod {
    /** The mod id; must match {@code META-INF/mods.toml} and the resource/data namespace. */
    public static final String MOD_ID = "magnet";

    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, MOD_ID);
    public static final DeferredRegister<DataComponentType<?>> DATA_COMPONENTS = DeferredRegister.create(Registries.DATA_COMPONENT_TYPE, MOD_ID);

    /** Whether a magnet is switched on. Absent (or false) means off, so a fresh magnet starts switched off. */
    public static final RegistryObject<DataComponentType<Boolean>> ACTIVE = DATA_COMPONENTS.register("active", () ->
        DataComponentType.<Boolean>builder()
            .persistent(Codec.BOOL)
            .networkSynchronized(ByteBufCodecs.BOOL)
            .build()
    );

    public static final RegistryObject<MagnetItem> MAGNET = ITEMS.register("magnet", () ->
        new MagnetItem(new Item.Properties()
            .setId(ITEMS.key("magnet"))
            .stacksTo(1)
        )
    );

    public MagnetMod(FMLJavaModLoadingContext context) {
        var modBusGroup = context.getModBusGroup();

        DATA_COMPONENTS.register(modBusGroup);
        ITEMS.register(modBusGroup);

        BuildCreativeModeTabContentsEvent.BUS.addListener(MagnetMod::addToCreativeTabs);

        context.registerConfig(ModConfig.Type.COMMON, MagnetConfig.SPEC);
    }

    /** Puts the magnet in the Tools &amp; Utilities tab, next to the compasses. */
    private static void addToCreativeTabs(BuildCreativeModeTabContentsEvent event) {
        if (event.getTabKey() == CreativeModeTabs.TOOLS_AND_UTILITIES) {
            // putAfter falls back to appending at the end of the tab if the anchor item is missing.
            event.getEntries().putAfter(new ItemStack(Items.RECOVERY_COMPASS), new ItemStack(MAGNET.get()), CreativeModeTab.TabVisibility.PARENT_AND_SEARCH_TABS);
        }
    }
}
