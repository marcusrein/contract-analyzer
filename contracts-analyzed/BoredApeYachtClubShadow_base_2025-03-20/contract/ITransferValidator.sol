// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITransferValidator {
    function validateTransfer(address caller, address from, address to) external view;
    function validateTransfer(address caller, address from, address to, uint256 tokenId) external view;
    function validateTransfer(address caller, address from, address to, uint256 tokenId, uint256 amount) external;
}
