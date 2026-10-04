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
 * container limit and the item's own stack size; for player inventory slots we use the configured limit instead,
 * the same one {@code Inventory#add} uses for pickups. Slots of chests and other containers are not touched, and
 * slots that restrict themselves below their container's limit (armour slots report one) keep their restriction.
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
        if (this.container instanceof Inventory inventory && this.getMaxStackSize() >= inventory.getMaxStackSize()) {
            cir.setReturnValue(BigStacks.limitFor(stack));
        }
    }
}
