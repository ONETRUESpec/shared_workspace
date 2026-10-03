package com.onetruespec.bigstacks.mixin;

import org.spongepowered.asm.mixin.Mixin;

import com.onetruespec.bigstacks.BigStacks;

import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.ItemStack;

/**
 * The player inventory is a {@code Container} whose default stack limit is 99. These two methods override the
 * {@code Container} defaults for player inventories only, so picking items up (which goes through
 * {@code Inventory#add}) fills stacks up to the configured limit.
 */
@Mixin(Inventory.class)
public abstract class InventoryMixin {
    /** Overrides {@code Container#getMaxStackSize()}: the slot limit of this inventory. */
    public int getMaxStackSize() {
        return BigStacks.inventoryLimit();
    }

    /** Overrides {@code Container#getMaxStackSize(ItemStack)}: the limit for a particular item in this inventory. */
    public int getMaxStackSize(ItemStack stack) {
        return BigStacks.limitFor(stack);
    }
}
