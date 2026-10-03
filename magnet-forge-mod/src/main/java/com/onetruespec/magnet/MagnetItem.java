package com.onetruespec.magnet;

import java.util.List;

import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * The magnet. Right-click toggles it; while it is switched on and sits anywhere in a player's inventory it pulls
 * nearby dropped items (and, optionally, experience orbs) towards that player, who then picks them up normally.
 *
 * <p>The on/off state is stored in the {@code magnet:active} data component. A switched-on magnet also carries an
 * enchantment glint and shows "(Active)" in its name so the state is visible at a glance.
 *
 * <p>All pulling happens on the server. Each pulled entity gets its velocity pointed at the player through
 * {@code Entity#push}, which also marks the entity for an immediate network sync, so clients receive its position
 * and motion every tick and the movement looks smooth without any client-side code.
 */
public class MagnetItem extends Item {
    public MagnetItem(Item.Properties properties) {
        super(properties);
    }

    public static boolean isActive(ItemStack stack) {
        return stack.getOrDefault(MagnetMod.ACTIVE.get(), false);
    }

    /** Switches the magnet on or off and updates the visible state (glint and name) to match. */
    public void setActive(ItemStack stack, boolean active) {
        if (active) {
            stack.set(MagnetMod.ACTIVE.get(), true);
            stack.set(DataComponents.ENCHANTMENT_GLINT_OVERRIDE, true);
            stack.set(DataComponents.ITEM_NAME, Component.translatable(this.getDescriptionId() + ".active"));
        } else {
            // Removing the patches leaves the stack identical to a freshly crafted magnet.
            stack.remove(MagnetMod.ACTIVE.get());
            stack.remove(DataComponents.ENCHANTMENT_GLINT_OVERRIDE);
            Component defaultName = this.components().get(DataComponents.ITEM_NAME);
            if (defaultName != null) {
                stack.set(DataComponents.ITEM_NAME, defaultName);
            } else {
                stack.remove(DataComponents.ITEM_NAME);
            }
        }
    }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (!level.isClientSide()) {
            boolean active = !isActive(stack);
            setActive(stack, active);
            // Same click as a lever: higher pitch for on, lower for off. A null "except" entity means everyone in
            // range hears it, including the player who clicked (Player#playSound would exclude them on the server).
            level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.LEVER_CLICK, SoundSource.PLAYERS, 0.4F, active ? 0.7F : 0.5F);
            player.sendSystemMessage(Component.translatable(this.getDescriptionId() + (active ? ".enabled" : ".disabled")));
            player.awardStat(Stats.ITEM_USED.get(this));
        }
        return InteractionResult.SUCCESS;
    }

    /**
     * Forge calls this every tick for every stack in a player's inventory (hotbar, main inventory, armour and
     * off-hand). Both vanilla call sites go through this five-argument overload.
     */
    @Override
    public void inventoryTick(ItemStack stack, Level level, Entity entity, EquipmentSlot slot, int slotIndex) {
        super.inventoryTick(stack, level, entity, slot, slotIndex);
        if (level instanceof ServerLevel serverLevel && entity instanceof Player player && isActive(stack) && !player.isSpectator()) {
            pullTowards(serverLevel, player);
        }
    }

    private static void pullTowards(ServerLevel level, Player player) {
        double range = MagnetConfig.RANGE.get();
        double rangeSquared = range * range;
        double speed = MagnetConfig.SPEED.get();
        int ownDropGraceTicks = MagnetConfig.OWN_DROP_COOLDOWN_SECONDS.get() * 20;

        // The box is only the broad phase; the real test is the spherical distance from the player's feet.
        Vec3 origin = player.position();
        AABB area = player.getBoundingBox().inflate(range);
        // Same box vanilla uses to pick items up (Player#touch). Anything already inside it is left to vanilla:
        // it gets picked up if it can be, and otherwise falls to the ground instead of being held in mid-air.
        AABB pickupZone = player.getBoundingBox().inflate(1.0D, 0.5D, 1.0D);

        // Aim for the middle of the player's body; vanilla picks the item up as soon as it touches the player.
        Vec3 target = origin.add(0.0D, player.getBbHeight() * 0.5D, 0.0D);

        List<ItemEntity> items = level.getEntitiesOfClass(ItemEntity.class, area,
            item -> item.distanceToSqr(origin) <= rangeSquared && !pickupZone.intersects(item.getBoundingBox()) && canPull(item, player, ownDropGraceTicks));
        for (ItemEntity item : items) {
            moveTowards(item, target, speed);
        }

        if (MagnetConfig.PULL_EXPERIENCE_ORBS.get()) {
            for (ExperienceOrb orb : level.getEntitiesOfClass(ExperienceOrb.class, area, orb -> orb.distanceToSqr(origin) <= rangeSquared)) {
                moveTowards(orb, target, speed);
            }
        }
    }

    private static boolean canPull(ItemEntity item, Player player, int ownDropGraceTicks) {
        // Items that cannot be picked up yet (just dropped, or marked as never pick up) would only hover around.
        if (item.hasPickUpDelay()) {
            return false;
        }
        // Leave the player's own throws alone for a while, otherwise dropping something would bring it straight back.
        if (ownDropGraceTicks > 0 && item.getAge() < ownDropGraceTicks && item.getOwner() == player) {
            return false;
        }
        // With a full inventory the item would only be dragged around, so leave it where it is until there is room.
        return player.hasInfiniteMaterials() || hasRoomFor(player.getInventory(), item.getItem());
    }

    /** Mirrors what {@code Inventory#add} would do without touching the inventory: an empty slot or a stack with space left. */
    private static boolean hasRoomFor(Inventory inventory, ItemStack stack) {
        return inventory.getFreeSlot() != -1 || inventory.getSlotWithRemainingSpace(stack) != -1;
    }

    private static void moveTowards(Entity entity, Vec3 target, double speed) {
        Vec3 delta = target.subtract(entity.position());
        double distance = delta.length();
        if (distance < 1.0E-4D) {
            return;
        }
        // Move at the configured speed, but never past the target.
        double step = Math.min(speed, distance);
        Vec3 wanted = delta.scale(step / distance);
        Vec3 current = entity.getDeltaMovement();
        // push() adds to the current motion and, unlike setDeltaMovement(), flags the entity for a network sync, so
        // the server sends its position and motion every tick instead of once a second. Pushing by the difference
        // leaves the entity moving at exactly the wanted velocity.
        entity.push(wanted.x - current.x, wanted.y - current.y, wanted.z - current.z);
    }
}
