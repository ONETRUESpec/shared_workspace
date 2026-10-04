package com.onetruespec.bigstacks.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

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

    /**
     * {@code placeItemBackInInventory} (closing a menu while carrying items, crafting-grid leftovers, recipe book)
     * picks a target slot with the container limit above but then computes how much to move with the item's own
     * limit. With a slot already holding 64 or more that amount is zero or negative and vanilla loops forever or
     * grows the stack. Use the same limit for both, so the amount is always positive for a chosen slot.
     */
    @Redirect(
        method = "placeItemBackInInventory",
        at = @At(value = "INVOKE", target = "Lnet/minecraft/world/item/ItemStack;getMaxStackSize()I")
    )
    private int bigstacks$sameLimitWhenPlacingBack(ItemStack stack) {
        return BigStacks.limitFor(stack);
    }
}
