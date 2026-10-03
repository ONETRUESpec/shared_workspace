package com.onetruespec.multitool;

import java.util.List;

import net.minecraft.core.HolderGetter;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.tags.BlockTags;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.ToolMaterial;
import net.minecraft.world.item.component.Tool;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.block.Block;

/**
 * A pickaxe, an axe and a shovel rolled into a single tool.
 *
 * <p>Mining is entirely handled by the {@link DataComponents#TOOL} component: the item mines (and drops) every
 * block in {@code #minecraft:mineable/pickaxe}, {@code #minecraft:mineable/axe} and {@code #minecraft:mineable/shovel}
 * at the speed of its {@link ToolMaterial}, and respects the material's harvest level through the material's
 * {@code incorrect_for_*_tool} tag, exactly like the vanilla tools do.
 *
 * <p>Right-click behaviour is delegated to vanilla's own axe and shovel implementations so the multi-tool strips
 * logs, scrapes and de-waxes copper, turns dirt into paths and puts out campfires, and automatically keeps up with
 * whatever Mojang adds to those tools in later versions.
 *
 * <p>In combat it behaves like an axe of the same material (same damage, same attack speed, disables shields).
 */
public class MultiToolItem extends Item {
    /** Vanilla axes disable a blocking shield for this long; the multi-tool fights like an axe. */
    private static final float DISABLE_BLOCKING_FOR_SECONDS = 5.0F;

    /** Three tools in one: the multi-tool gets twice the durability of a single tool of the same material. */
    public static final int DURABILITY_MULTIPLIER = 2;

    /**
     * @param material     the vanilla tool material (mining speed, harvest level, enchantability, repair item)
     * @param attackDamage the attack damage bonus on top of the material's bonus; vanilla axe values fit well
     * @param attackSpeed  the attack speed modifier; vanilla axe values fit well
     * @param properties   item properties with the registry id already set via {@code setId}
     */
    public MultiToolItem(ToolMaterial material, float attackDamage, float attackSpeed, Item.Properties properties) {
        super(applyMultiToolProperties(material, attackDamage, attackSpeed, properties));
    }

    private static Item.Properties applyMultiToolProperties(ToolMaterial material, float attackDamage, float attackSpeed, Item.Properties properties) {
        // Let the material do what it does for vanilla's own axes: durability, repair ingredient, enchantability,
        // attack attributes, the shield-disabling weapon component and an (axe-only) TOOL component.
        Item.Properties toolProperties = material.applyToolProperties(properties, BlockTags.MINEABLE_WITH_AXE, attackDamage, attackSpeed, DISABLE_BLOCKING_FOR_SECONDS);

        // Then swap the axe-only TOOL component for one covering all three block families. Rules are checked in
        // order, so the material's "incorrect for this tool" tag goes first to keep the vanilla harvest levels.
        HolderGetter<Block> blocks = BuiltInRegistries.acquireBootstrapRegistrationLookup(BuiltInRegistries.BLOCK);
        Tool tool = new Tool(List.of(
            Tool.Rule.deniesDrops(blocks.getOrThrow(material.incorrectBlocksForDrops())),
            Tool.Rule.minesAndDrops(blocks.getOrThrow(BlockTags.MINEABLE_WITH_PICKAXE), material.speed()),
            Tool.Rule.minesAndDrops(blocks.getOrThrow(BlockTags.MINEABLE_WITH_AXE), material.speed()),
            Tool.Rule.minesAndDrops(blocks.getOrThrow(BlockTags.MINEABLE_WITH_SHOVEL), material.speed())
        ), 1.0F, 1, true);

        return toolProperties
            .component(DataComponents.TOOL, tool)
            .durability(material.durability() * DURABILITY_MULTIPLIER);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        // Shovel behaviour first: flatten grass and dirt into paths, extinguish campfires.
        // Vanilla's ShovelItem and AxeItem only read the clicked block and the held stack from the context,
        // so any vanilla instance can perform the interaction on behalf of this item.
        InteractionResult shovelResult = Items.IRON_SHOVEL.useOn(context);
        if (shovelResult.consumesAction()) {
            return shovelResult;
        }

        // Then axe behaviour: strip logs and wood, scrape oxidation and wax off copper blocks.
        return Items.IRON_AXE.useOn(context);
    }
}
