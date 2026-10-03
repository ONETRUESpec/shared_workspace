package com.onetruespec.invsorter;

import net.minecraft.resources.Identifier;
import net.minecraftforge.network.Channel.VersionTest;
import net.minecraftforge.network.ChannelBuilder;
import net.minecraftforge.network.SimpleChannel;

/** The mod's network channel: a single server-bound {@link SortPacket}. */
public final class SorterNetwork {
    private static final Identifier CHANNEL_NAME = Identifier.fromNamespaceAndPath(InventorySorterMod.MOD_ID, "main");
    private static final int PROTOCOL_VERSION = 1;

    /**
     * Either side may be missing the mod: a client with the sorter can still join vanilla or sorter-less servers
     * (sorting just does nothing there), and clients without it can join a server that has it.
     */
    private static final VersionTest OPTIONAL = VersionTest.exact(PROTOCOL_VERSION).or(VersionTest.ACCEPT_MISSING).or(VersionTest.ACCEPT_VANILLA);

    public static final SimpleChannel CHANNEL = ChannelBuilder
        .named(CHANNEL_NAME)
        .clientAcceptedVersions(OPTIONAL)
        .serverAcceptedVersions(OPTIONAL)
        .networkProtocolVersion(PROTOCOL_VERSION)
        .simpleChannel()
            .play()
                .serverbound()
                    .addMain(SortPacket.class, SortPacket.STREAM_CODEC, SortPacket::handle)
        .build();

    private SorterNetwork() {
    }

    /** Forces the channel to be created; call during mod construction. */
    public static void init() {
        // Touching the class is enough: CHANNEL is built in the static initialiser.
    }
}
