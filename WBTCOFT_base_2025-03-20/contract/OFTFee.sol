// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Fee } from "@layerzerolabs/oft-evm/contracts/Fee.sol";

/**
 * @title OFTFee Contract
 * @notice OFT with fees.
 */
abstract contract OFTFee is OFT, Fee {
    address public feeOwner;

    event FeeOwnerSet(address _feeOwner);

    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _owner
    ) OFT(_name, _symbol, _lzEndpoint, _owner) Ownable(_owner) {
        feeOwner = _owner;
    }

    function setFeeOwner(address _feeOwner) external onlyOwner {
        if (_feeOwner == address(0)) revert InvalidFeeOwner();
        feeOwner = _feeOwner;
        emit FeeOwnerSet(_feeOwner);
    }

    function _debitView(
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal view virtual override returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        amountSentLD = _amountLD;

        // @dev Apply the fee, then de-dust the amount afterwards.
        // This means the fee is taken from the amount before the dust is removed.
        uint256 fee = getFee(_dstEid, _amountLD);
        amountReceivedLD = _removeDust(_amountLD - fee);

        // @dev Check for slippage.
        if (amountReceivedLD < _minAmountLD) {
            revert SlippageExceeded(amountReceivedLD, _minAmountLD);
        }
    }

    function _debit(
        address _from,
        uint256 _amountLD,
        uint256 _minAmountLD,
        uint32 _dstEid
    ) internal virtual override returns (uint256 amountSentLD, uint256 amountReceivedLD) {
        (amountSentLD, amountReceivedLD) = _debitView(_amountLD, _minAmountLD, _dstEid);
        uint256 fee = amountSentLD - amountReceivedLD;
        if (fee > 0) {
            _transfer(_from, feeOwner, fee);
        }
        _burn(_from, amountReceivedLD);
    }
}
