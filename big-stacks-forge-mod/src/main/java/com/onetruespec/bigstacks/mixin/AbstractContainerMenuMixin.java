package com.onetruespec.bigstacks.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.item.ItemStack;

/**
 * Shift-clicking moves items with {@code AbstractContainerMenu#moveItemStackTo}. Forge caps the merge there at
 * {@code Math.min(slot.getMaxStackSize(target), target.getMaxStackSize())}, i.e. at the item's own stack size,
 * which would stop inventory stacks at 64 on that path. The slot limit already includes the item's stack size for
 * every slot that is not a player inventory slot, so the extra item-level cap can be lifted without changing how
 * chests behave.
 */
@Mixin(AbstractContainerMenu.class)
public abstract class AbstractContainerMenuMixin {
    @Redirect(
        method = "moveItemStackTo",
        at = @At(value = "INVOKE", target = "Lnet/minecraft/world/item/ItemStack;getMaxStackSize()I"),
        require = 0
    )
    private int bigstacks$letTheSlotDecide(ItemStack target) {
        return Integer.MAX_VALUE;
    }
}
