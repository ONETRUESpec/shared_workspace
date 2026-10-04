package com.onetruespec.bigstacks.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Redirect;

import com.onetruespec.bigstacks.BigStacks;

import net.minecraft.server.network.ServerGamePacketListenerImpl;
import net.minecraft.world.item.ItemStack;

/**
 * In creative mode the inventory screen is edited on the client and every changed slot is sent to the server,
 * which only accepts a stack whose count is at most the item's own stack size. Without this, moving a big stack
 * in the creative inventory would be silently discarded by the server (the stack vanishes on the next sync).
 * Accept up to the same limit the inventory itself allows.
 */
@Mixin(ServerGamePacketListenerImpl.class)
public abstract class ServerGamePacketListenerImplMixin {
    @Redirect(
        method = "handleSetCreativeModeSlot",
        at = @At(value = "INVOKE", target = "Lnet/minecraft/world/item/ItemStack;getMaxStackSize()I"),
        require = 0
    )
    private int bigstacks$acceptBigCreativeStacks(ItemStack stack) {
        return BigStacks.limitFor(stack);
    }
}
