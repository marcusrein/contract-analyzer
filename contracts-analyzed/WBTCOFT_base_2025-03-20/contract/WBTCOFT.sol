// SPDX-License-Identifier: MIT

pragma solidity ^0.8.22;

import { OFTFee } from "./OFTFee.sol";

contract WBTCOFT is OFTFee {
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _owner
    ) OFTFee(_name, _symbol, _lzEndpoint, _owner) {}

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    function sharedDecimals() public pure override returns (uint8) {
        return 8;
    }
}
