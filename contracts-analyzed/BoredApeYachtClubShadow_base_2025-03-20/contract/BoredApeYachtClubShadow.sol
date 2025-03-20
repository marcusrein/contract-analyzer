// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {NFTShadow} from "../NFTShadow.sol";

/**
 * @title BoredApeYachtClubShadow
 */
contract BoredApeYachtClubShadow is NFTShadow {
    constructor(address _beacon) NFTShadow(_beacon) {
        initialize(
            0x58A766B3210ceE94Ca150f767D842Eb87A8d7aE8,
            "Bored Ape Yacht Club Shadow",
            "BAYC",
            "ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/",
            address(0),
            address(0),
            0
        );
    }
}
