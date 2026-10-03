package com.onetruespec.invsorter;

import com.mojang.blaze3d.platform.InputConstants;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.inventory.Slot;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.eventbus.api.listener.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.network.PacketDistributor;

/**
 * Client side: watches container screens for the Pick Block key (middle mouse by default) and asks the server to
 * sort the inventory that owns the slot under the cursor. Only loaded on the client.
 *
 * <p>In creative mode the Pick Block key already clones the hovered stack, so there the sorter only reacts when
 * Shift is held as well. The creative inventory screen itself is skipped because its slots are client-side only;
 * creative players sort their inventory from the inventory half of any chest screen instead.
 */
@Mod.EventBusSubscriber(modid = InventorySorterMod.MOD_ID, value = Dist.CLIENT, bus = Mod.EventBusSubscriber.Bus.FORGE)
public final class SorterClient {
    private SorterClient() {
    }

    /** Returning true cancels the click, so vanilla does not also treat it as a clone/pick action. */
    @SubscribeEvent
    public static boolean onMouseButton(ScreenEvent.MouseButtonPressed.Pre event) {
        if (!(event.getScreen() instanceof AbstractContainerScreen<?> screen)) {
            return false;
        }
        InputConstants.Key key = InputConstants.Type.MOUSE.getOrCreate(event.getInfo().button());
        return trySort(screen, key);
    }

    /** The same for a Pick Block binding on the keyboard. */
    @SubscribeEvent
    public static boolean onKeyPressed(ScreenEvent.KeyPressed.Pre event) {
        if (!(event.getScreen() instanceof AbstractContainerScreen<?> screen)) {
            return false;
        }
        return trySort(screen, InputConstants.getKey(event.getInfo()));
    }

    private static boolean trySort(AbstractContainerScreen<?> screen, InputConstants.Key key) {
        Minecraft minecraft = Minecraft.getInstance();
        LocalPlayer player = minecraft.player;
        if (player == null || screen instanceof CreativeModeInventoryScreen) {
            return false;
        }
        if (!minecraft.options.keyPickItem.isActiveAndMatches(key)) {
            return false;
        }
        if (player.hasInfiniteMaterials() && !minecraft.hasShiftDown()) {
            return false; // leave creative mode's clone-on-pick alone unless Shift is held
        }
        Slot hovered = screen.getSlotUnderMouse();
        if (hovered == null) {
            return false;
        }
        SorterNetwork.CHANNEL.send(new SortPacket(hovered.index, SorterConfig.INCLUDE_HOTBAR.get()), PacketDistributor.SERVER.noArg());
        return true;
    }
}
