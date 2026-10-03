package com.onetruespec.bigstacks.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.Constant;
import org.spongepowered.asm.mixin.injection.ModifyConstant;

import com.onetruespec.bigstacks.BigStacks;

import net.minecraft.world.item.ItemStack;

/**
 * The item save format only accepts counts from 1 to 99 ({@code ItemStack.CODEC} is built with an
 * {@code intRange(1, 99)} count field in the class's static initialiser or one of its lambdas). This widens that
 * upper bound so inventory stacks above 99 can be saved and loaded. {@code BigStacksMod} verifies at startup that
 * the widening took effect and otherwise keeps stacks at 99.
 */
@Mixin(ItemStack.class)
public abstract class ItemStackMixin {
    @ModifyConstant(
        method = {"<clinit>", "/^lambda\\$static\\$\\d+$/"},
        constant = @Constant(intValue = BigStacks.VANILLA_LIMIT),
        require = 0
    )
    private static int bigstacks$widenSavedCountLimit(int original) {
        return BigStacks.SERIALIZED_COUNT_LIMIT;
    }
}
