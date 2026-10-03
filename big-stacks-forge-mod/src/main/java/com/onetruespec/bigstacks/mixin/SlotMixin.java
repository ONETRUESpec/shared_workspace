package com.onetruespec.bigstacks.mixin;

import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import com.onetruespec.bigstacks.BigStacks;

import net.minecraft.world.Container;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

/**
 * Every menu (the inventory screen, chests, furnaces, villagers...) shows the player's inventory through
 * {@code Slot}s whose container is the player's {@code Inventory}. Vanilla limits such a slot to the smaller of the
 * container limit and the item's own stack size; for player inventory slots we use the configured limit instead.
 * Slots of chests and other containers are not touched, and slots that restrict themselves (armour slots report a
 * limit of one) keep their restriction.
 */
@Mixin(Slot.class)
public abstract class SlotMixin {
    @Shadow
    @Final
    public Container container;

    @Shadow
    public abstract int getMaxStackSize();

    @Inject(method = "getMaxStackSize(Lnet/minecraft/world/item/ItemStack;)I", at = @At("HEAD"), cancellable = true)
    private void bigstacks$playerInventoryLimit(ItemStack stack, CallbackInfoReturnable<Integer> cir) {
        if (this.container instanceof Inventory) {
            int slotLimit = this.getMaxStackSize(); // subclasses such as armour slots override this with 1
            if (slotLimit >= stack.getMaxStackSize()) {
                cir.setReturnValue(Math.min(slotLimit, BigStacks.limitFor(stack)));
            }
        }
    }
}
