package com.onetruespec.invsorter;

import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.server.level.ServerPlayer;
import net.minecraftforge.event.network.CustomPayloadEvent;

/**
 * Client to server: "sort the part of my open menu that contains this slot".
 *
 * @param slotIndex     index into the open menu's slot list, or -1 for the player's own inventory
 * @param includeHotbar whether the hotbar should be sorted along with the main inventory
 */
public record SortPacket(int slotIndex, boolean includeHotbar) {
    public static final StreamCodec<RegistryFriendlyByteBuf, SortPacket> STREAM_CODEC = StreamCodec.ofMember(SortPacket::encode, SortPacket::decode);

    public static void encode(SortPacket message, RegistryFriendlyByteBuf buf) {
        buf.writeVarInt(message.slotIndex);
        buf.writeBoolean(message.includeHotbar);
    }

    public static SortPacket decode(RegistryFriendlyByteBuf buf) {
        return new SortPacket(buf.readVarInt(), buf.readBoolean());
    }

    /** Runs on the server main thread (the channel registers it with {@code addMain}). */
    public static void handle(SortPacket message, CustomPayloadEvent.Context context) {
        ServerPlayer sender = context.getSender();
        if (sender != null) {
            InventorySorter.sort(sender, message.slotIndex(), message.includeHotbar());
        }
    }
}
