package com.onetruespec.invsorter;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.registries.ForgeRegistries;

/**
 * The server-side sorting logic. Works on the menu the player currently has open, so it covers the player's own
 * inventory as well as chests, barrels, shulker boxes, ender chests, hoppers, dispensers and any other container
 * whose slots accept every item (menus with restricted slots such as furnaces or brewing stands are left alone).
 *
 * <p>Sorting never creates or destroys items: it merges stacks of identical items, orders them and writes them
 * back into the same slots. The total item count is verified before anything is written.
 */
public final class InventorySorter {
    /** Container slots 0 to 8 of a player's inventory are the hotbar. */
    private static final int HOTBAR_SIZE = 9;
    /** Container slots 9 to 35 of a player's inventory are the main inventory; armour and off-hand come after. */
    private static final int MAIN_INVENTORY_END = 36;

    /** Blocks before items, then by registry id, then least damaged first, then fullest stack first. */
    private static final Comparator<ItemStack> ORDER = Comparator
        .comparingInt((ItemStack stack) -> stack.getItem() instanceof BlockItem ? 0 : 1)
        .thenComparing(stack -> registryName(stack.getItem()))
        .thenComparingInt(ItemStack::getDamageValue)
        .thenComparing((a, b) -> Integer.compare(b.getCount(), a.getCount()));

    private InventorySorter() {
    }

    /**
     * Sorts the part of the player's open menu that the given slot belongs to.
     *
     * @param player        the player who asked for the sort; their currently open menu is used
     * @param slotIndex     index into the menu's slot list that was clicked, or -1 for the player's own inventory
     * @param includeHotbar whether the hotbar is sorted together with the main inventory when the player's
     *                      inventory is the target
     */
    public static void sort(ServerPlayer player, int slotIndex, boolean includeHotbar) {
        if (player.isSpectator()) {
            return;
        }
        AbstractContainerMenu menu = player.containerMenu;
        if (menu == null) {
            return;
        }

        Container playerInventory = player.getInventory();
        Container target = playerInventory;
        if (slotIndex >= 0 && slotIndex < menu.slots.size()) {
            target = menu.getSlot(slotIndex).container;
        }

        List<Slot> slots = new ArrayList<>();
        for (Slot slot : menu.slots) {
            if (slot.container != target || slot.isFake()) {
                continue;
            }
            if (target == playerInventory) {
                int index = slot.getSlotIndex();
                int first = includeHotbar ? 0 : HOTBAR_SIZE;
                if (index < first || index >= MAIN_INVENTORY_END) {
                    continue; // hotbar (unless wanted), armour, off-hand
                }
            }
            slots.add(slot);
        }
        if (slots.size() < 2) {
            return;
        }

        List<ItemStack> stacks = new ArrayList<>();
        long total = 0;
        for (Slot slot : slots) {
            ItemStack stack = slot.getItem();
            if (!stack.isEmpty()) {
                stacks.add(stack.copy());
                total += stack.getCount();
            }
        }
        if (stacks.isEmpty()) {
            return;
        }

        // Only sort containers whose slots take anything we might put in them (rules out furnaces, brewing
        // stands, anvils and the like). Checking every slot keeps it correct for mixed menus too.
        for (Slot slot : slots) {
            for (ItemStack stack : stacks) {
                if (!slot.mayPlace(stack)) {
                    return;
                }
            }
        }

        List<ItemStack> merged = merge(stacks, slots.get(0));
        long mergedTotal = 0;
        for (ItemStack stack : merged) {
            mergedTotal += stack.getCount();
        }
        if (mergedTotal != total || merged.size() > slots.size()) {
            return; // never write back anything that would change the item count
        }
        merged.sort(ORDER);

        for (int i = 0; i < slots.size(); i++) {
            slots.get(i).set(i < merged.size() ? merged.get(i) : ItemStack.EMPTY);
        }
        menu.broadcastChanges();
    }

    /** Combines stacks of identical items up to the stack limit the slots allow. */
    private static List<ItemStack> merge(List<ItemStack> stacks, Slot limitSlot) {
        List<ItemStack> merged = new ArrayList<>();
        for (ItemStack stack : stacks) {
            for (ItemStack existing : merged) {
                if (stack.isEmpty()) {
                    break;
                }
                int limit = limitSlot.getMaxStackSize(existing);
                if (existing.getCount() < limit && ItemStack.isSameItemSameComponents(existing, stack)) {
                    int moved = Math.min(limit - existing.getCount(), stack.getCount());
                    existing.grow(moved);
                    stack.shrink(moved);
                }
            }
            if (!stack.isEmpty()) {
                merged.add(stack);
            }
        }
        return merged;
    }

    private static String registryName(Item item) {
        Identifier id = ForgeRegistries.ITEMS.getKey(item);
        return id == null ? "" : id.toString();
    }
}
