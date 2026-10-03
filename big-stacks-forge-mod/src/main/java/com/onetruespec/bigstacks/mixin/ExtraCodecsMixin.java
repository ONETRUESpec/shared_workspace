package com.onetruespec.bigstacks.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

import com.onetruespec.bigstacks.BigStacks;

import net.minecraft.util.ExtraCodecs;

/**
 * The item save format limits a stack's count with {@code ExtraCodecs.intRange(1, 99)} (Minecraft 26.3,
 * {@code ItemStack}: {@code optionalAlwaysPresentFieldOf(ExtraCodecs.intRange(1, 99), "count", 1)}). Rather than
 * hunting for that constant inside a compiler-generated lambda, this widens every {@code intRange} whose upper
 * bound is exactly 99 at the moment the codec is built. Apart from the stack count, the only other such range in
 * vanilla is the {@code max_stack_size} component, which is harmless to widen.
 */
@Mixin(ExtraCodecs.class)
public abstract class ExtraCodecsMixin {
    @ModifyVariable(method = "intRange(II)Lcom/mojang/serialization/Codec;", at = @At("HEAD"), argsOnly = true, index = 1)
    private static int bigstacks$widenNinetyNine(int maxInclusive) {
        return maxInclusive == BigStacks.VANILLA_LIMIT ? BigStacks.SERIALIZED_COUNT_LIMIT : maxInclusive;
    }
}
