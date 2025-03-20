// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

struct CollectionConfig {
    uint32 baseCollectionChainId;
    uint32 baseCollectionEid;
    uint32 baseCollectionPerNftOwnershipUpdateCost; // cost of transferring an NFT from the base collection. If 0, default of 100_000 is used
    address shadowAddress; // Local shadow address for this chain
}
