// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {CollectionConfig} from "../structs/CollectionConfig.sol";

interface IBeacon {
    function read(
        address contractAddress,
        uint256[] calldata tokenIds,
        uint32[] calldata eids,
        address refundRecipient,
        uint128 callbackGasLimit
    ) external payable returns (bytes32);
    function send(
        uint32 eid,
        address collection,
        uint256[] calldata tokenIds,
        address beneficiary,
        address refundRecipient,
        uint128 supplementalGasLimit
    ) external payable;
    function getSendOptions(address collectionAddress, uint256[] calldata tokenIds)
        external
        view
        returns (bytes memory);
    function getReadOptions(address collectionAddress, uint256[] calldata tokenIds, uint128 callbackGasLimit)
        external
        view
        returns (bytes memory);
    function quoteSend(uint32 eid, address collectionAddress, uint256[] calldata tokenIds, bytes calldata _options)
        external
        view
        returns (uint256 nativeFee, uint256 lzTokenFee);
    function quoteRead(
        address collectionAddress,
        uint256[] calldata tokenIds,
        uint32[] calldata eids,
        bytes calldata _options
    ) external view returns (uint256 nativeFee, uint256 lzTokenFee);
    function registerCollection(
        address _shadowAddress,
        uint32 _baseCollectionChainId,
        address _baseCollectionAddress,
        uint32 _baseCollectionEid,
        uint32 _baseCollectionPerNftOwnershipUpdateCost
    ) external;
    function shadowToBase(address _shadowAddress) external view returns (address);
    function baseToShadow(address _baseAddress) external view returns (address);
    function collectionConfigs(address _shadowAddress) external view returns (CollectionConfig memory);
}
