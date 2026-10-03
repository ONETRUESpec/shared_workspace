package com.onetruespec.multitool;

import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.ToolMaterial;
import net.minecraftforge.event.BuildCreativeModeTabContentsEvent;
import net.minecraftforge.registries.DeferredRegister;
import net.minecraftforge.registries.ForgeRegistries;
import net.minecraftforge.registries.RegistryObject;

/**
 * Registry of the seven multi-tools, one per vanilla tool material.
 *
 * <p>Attack damage and attack speed match the vanilla axe of the same material, so a diamond multi-tool hits as
 * hard and as fast as a diamond axe.
 */
public final class MultiToolItems {
    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, MultiToolMod.MOD_ID);

    public static final RegistryObject<MultiToolItem> WOODEN_MULTITOOL = register("wooden_multitool", ToolMaterial.WOOD, 6.0F, -3.2F);
    public static final RegistryObject<MultiToolItem> STONE_MULTITOOL = register("stone_multitool", ToolMaterial.STONE, 7.0F, -3.2F);
    public static final RegistryObject<MultiToolItem> COPPER_MULTITOOL = register("copper_multitool", ToolMaterial.COPPER, 7.0F, -3.2F);
    public static final RegistryObject<MultiToolItem> IRON_MULTITOOL = register("iron_multitool", ToolMaterial.IRON, 6.0F, -3.1F);
    public static final RegistryObject<MultiToolItem> GOLDEN_MULTITOOL = register("golden_multitool", ToolMaterial.GOLD, 6.0F, -3.0F);
    public static final RegistryObject<MultiToolItem> DIAMOND_MULTITOOL = register("diamond_multitool", ToolMaterial.DIAMOND, 5.0F, -3.0F);
    public static final RegistryObject<MultiToolItem> NETHERITE_MULTITOOL = register("netherite_multitool", ToolMaterial.NETHERITE, 5.0F, -3.0F);

    private MultiToolItems() {
    }

    private static RegistryObject<MultiToolItem> register(String name, ToolMaterial material, float attackDamage, float attackSpeed) {
        return ITEMS.register(name, () -> {
            Item.Properties properties = new Item.Properties().setId(ITEMS.key(name));
            if (material == ToolMaterial.NETHERITE) {
                // Like every vanilla netherite item: survives lava and fire when dropped.
                properties.fireResistant();
            }
            return new MultiToolItem(material, attackDamage, attackSpeed, properties);
        });
    }

    /** Puts every multi-tool in the Tools &amp; Utilities tab, right after the vanilla hoe of the same material. */
    static void addToCreativeTabs(BuildCreativeModeTabContentsEvent event) {
        if (event.getTabKey() != CreativeModeTabs.TOOLS_AND_UTILITIES) {
            return;
        }

        insertAfter(event, Items.WOODEN_HOE, WOODEN_MULTITOOL);
        insertAfter(event, Items.STONE_HOE, STONE_MULTITOOL);
        insertAfter(event, Items.COPPER_HOE, COPPER_MULTITOOL);
        insertAfter(event, Items.IRON_HOE, IRON_MULTITOOL);
        insertAfter(event, Items.GOLDEN_HOE, GOLDEN_MULTITOOL);
        insertAfter(event, Items.DIAMOND_HOE, DIAMOND_MULTITOOL);
        insertAfter(event, Items.NETHERITE_HOE, NETHERITE_MULTITOOL);
    }

    private static void insertAfter(BuildCreativeModeTabContentsEvent event, Item anchor, RegistryObject<? extends Item> item) {
        // putAfter falls back to appending at the end of the tab if another mod removed the anchor item.
        event.getEntries().putAfter(new ItemStack(anchor), new ItemStack(item.get()), CreativeModeTab.TabVisibility.PARENT_AND_SEARCH_TABS);
    }
}
