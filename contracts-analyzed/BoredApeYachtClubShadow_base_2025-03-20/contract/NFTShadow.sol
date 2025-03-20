// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "solady/tokens/ERC721.sol";
import {LibString} from "solady/utils/LibString.sol";
import {OwnableRoles} from "solady/auth/OwnableRoles.sol";
import {ERC2981} from "solady/tokens/ERC2981.sol";

import {IERC5192} from "./interfaces/IERC5192.sol";
import {IBeacon} from "./interfaces/IBeacon.sol";
import {ICreatorToken} from "./interfaces/ICreatorToken.sol";
import {ITransferValidator} from "./interfaces/ITransferValidator.sol";
import {IShadowCallbackReceiver} from "./interfaces/IShadowCallbackReceiver.sol";

/**
 * @title NFTShadow
 * @author @0xQuit
 * @notice A contract for soulbound Shadow NFTs that follow ownership on a remote chain.
 * @notice This contract is designed to be used with a Beacon contract (see IBeacon.sol) to maintain ownership records
 * through LayerZero's lzRead protocol.
 * @notice Soulbound tokens can be unlocked by locking them on their source chain.
 * @notice Contracts have shadow mode disabled by default. In this state, they function very much like a typical oNFT. They
 * can be minted by locking the native asset, and the native asset can be unlocked by burning the Shadow NFT.
 * @notice When tokens are locked, ONLY the Beacon contract can transfer them. They will follow the canonical owner,
 * as resolved by the ExclusiveDelegateResolver (the "Resolver") contract. Users should only issue Resolver compatible
 * delegations for assets if they own the delegatee. Though the delegatee can not claim ownership of the underlying asset,
 * they may be able to claim airdrops, participate in activations, or otherwise interact with the asset using the Shadow NFT.
 */
contract NFTShadow is ERC721, ERC2981, IERC5192, ICreatorToken, OwnableRoles {
    // Only the Beacon contract can perform admin actions when a token is in Shadow mode
    error CallerNotBeacon();

    // ERC-4906 BatchMetadataUpdate event
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    // The token is currently in Shadow mode
    error TokenLocked();

    // The token is not in Shadow mode
    error TokenNotLocked();

    // The function selector is not recognized
    error FnSelectorNotRecognized();

    // Emitted when a new metadata renderer is set
    event MetadataRendererSet(address indexed metadataRenderer);

    // Emitted when shadow mode is enabled
    event ShadowModeEnabled();

    // The address of the Beacon contract
    address public immutable BEACON_CONTRACT_ADDRESS;

    // Admin management roles
    uint256 public constant SHADOW_MODE_MANAGER_ROLE = _ROLE_13;
    uint256 public constant METADATA_MANAGER_ROLE = _ROLE_42;
    uint256 public constant TRANSFER_VALIDATOR_MANAGER_ROLE = _ROLE_69;
    uint256 public constant ROYALTY_MANAGER_ROLE = _ROLE_88;

    // The address of the ERC721C transfer validator, address(0) for none
    address public transferValidator;

    // Mapping to store callback target for each GUID
    mapping(bytes32 guid => address callbackTarget) public callbacks;

    // _extraData flags to indicate if a token is in Shadow mode (locked) or not (unlocked)
    uint96 private constant LOCKED = 0;
    uint96 private constant UNLOCKED = 1;

    // The base URI for the token metadata
    string private _baseTokenUri;

    // The name of the collection
    string private _name;

    // The symbol of the collection
    string private _symbol;

    // The address of the MetadataRenderer contract (address(0) if not set)
    address public metadataRenderer;

    // If false, the token can only be minted by locking it on the source chain
    bool public shadowModeEnabled;

    /**
     * @param _beaconContract The address of the Beacon contract
     */
    constructor(address _beaconContract) {
        BEACON_CONTRACT_ADDRESS = _beaconContract;
    }

    /// @dev Fallback function for calls from Beacon contract.
    fallback() external {
        _shadowFallback();
    }

    /**
     * @notice Initializes the NFTShadow contract.
     * @param _initialOwner The address of the initial owner.
     * @param _collectionName The name of the collection.
     * @param _collectionSymbol The symbol of the collection.
     * @param _baseTokenURI The base URI for the token metadata.
     * @param _metadataRenderer The address of the MetadataRenderer contract.
     * @param _transferValidator The address of the transfer validator.
     * @param _royaltyFeeNumerator The ERC2981 royalty fee numerator.
     */
    function initialize(
        address _initialOwner,
        string memory _collectionName,
        string memory _collectionSymbol,
        string memory _baseTokenURI, // can be left empty if metadataRenderer is set
        address _metadataRenderer, // address(0) if not set
        address _transferValidator,
        uint96 _royaltyFeeNumerator
    ) public {
        _baseTokenUri = _baseTokenURI;
        _name = _collectionName;
        _symbol = _collectionSymbol;
        metadataRenderer = _metadataRenderer;
        _initializeOwner(_initialOwner);

        transferValidator = _transferValidator;
        _setDefaultRoyalty(_initialOwner, _royaltyFeeNumerator);
    }

    /**
     * @notice Transfers a token from one address to another.
     * @param from The address of the sender.
     * @param to The address of the recipient.
     * @param tokenId The token ID to transfer.
     * @dev If the token is locked, only the Beacon contract can transfer it.
     * @dev If the token is unlocked, only the owner or approved address can transfer it.
     */
    function transferFrom(address from, address to, uint256 tokenId) public payable virtual override {
        if (msg.sender == BEACON_CONTRACT_ADDRESS) {
            if (_getExtraData(tokenId) == UNLOCKED) revert TokenNotLocked();

            _transfer(address(0), from, to, tokenId);
        } else {
            super.transferFrom(from, to, tokenId);
        }
    }

    /**
     * @notice Triggers an ownership update for the tokens.
     * @param tokenIds The token IDs to update ownership for.
     * @param eids The EIDs to read ownership from. If token is locked on the provided EID, no update will occur.
     */
    function read(uint256[] calldata tokenIds, uint32[] calldata eids) public payable virtual returns (bytes32) {
        return _read(tokenIds, eids, 0);
    }

    /**
     * @notice Triggers an ownership update with custom options. Helpful if a component of the update or callback is particularly expensive.
     * @param tokenIds The token IDs to update ownership for.
     * @param eids The EIDs to read ownership from. If token is locked on the provided EID, no update will occur.
     * @param callbackGasLimit The gas limit for the callback.
     * @return guid The GUID of the callback.
     * @dev Any excess fees provided to LayerZero will be returned to the caller. Potential callers are responsible for ensuring
     * that they are able to receive native tokens.
     */
    function readWithCallback(uint256[] calldata tokenIds, uint32[] calldata eids, uint128 callbackGasLimit)
        external
        payable
        virtual
        returns (bytes32)
    {
        bytes32 guid = _read(tokenIds, eids, callbackGasLimit);

        callbacks[guid] = msg.sender;

        return guid;
    }

    /**
     * @notice Unlocks and sends tokens to the beneficiary on the specified EID.
     * @param dstEid The EID to unlock and send the tokens on.
     * @param tokenIds The token IDs to unlock and send.
     * @param beneficiary The address of the recipient on the target chain.
     * @param refundRecipient The address to refund the native fee to.
     * @param supplementalGasLimit The gas limit for the callback.
     * @dev Must be owner or approved, and the token must be unlocked (not in Shadow mode). Tokens released on the target chain will be locked on this chain.
     */
    function send(
        uint32 dstEid,
        uint256[] calldata tokenIds,
        address beneficiary,
        address refundRecipient,
        uint128 supplementalGasLimit
    ) external payable virtual {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (!_isApprovedOrOwner(msg.sender, tokenIds[i])) revert NotOwnerNorApproved();
            if (_locked(tokenIds[i])) revert TokenLocked();

            if (!shadowModeEnabled) {
                _burn(tokenIds[i]);
            }

            _setExtraData(tokenIds[i], LOCKED);

            emit Locked(tokenIds[i]);
        }

        address baseCollectionAddress = IBeacon(BEACON_CONTRACT_ADDRESS).shadowToBase(address(this));
        IBeacon(BEACON_CONTRACT_ADDRESS).send{value: msg.value}(
            dstEid, baseCollectionAddress, tokenIds, beneficiary, refundRecipient, supplementalGasLimit
        );
    }

    /**
     * @notice Enables shadow mode for the token.
     * @dev If shadow mode is enabled, shadows can be minted by the Beacon contract.
     * @dev Once enabled, shadow mode cannot be disabled.
     */
    function enableShadowMode() external onlyRoles(SHADOW_MODE_MANAGER_ROLE) {
        shadowModeEnabled = true;
    }

    /**
     * @notice Sets the base URI for the token metadata.
     * @param uri The base URI for the token metadata.
     * emits BatchMetadataUpdate event
     */
    function setTokenURI(string memory uri) external onlyRoles(METADATA_MANAGER_ROLE) {
        _baseTokenUri = uri;

        emit BatchMetadataUpdate(0, type(uint256).max);
    }

    /**
     * @notice Sets the metadata renderer for the collection.
     * @param _metadataRenderer The address of the metadata renderer.
     */
    function setMetadataRenderer(address _metadataRenderer) external onlyRoles(METADATA_MANAGER_ROLE) {
        metadataRenderer = _metadataRenderer;

        emit MetadataRendererSet(_metadataRenderer);
        emit BatchMetadataUpdate(0, type(uint256).max);
    }

    /**
     * @notice Sets the transfer validator for the collection.
     * @param transferValidator_ The address of the transfer validator.
     * @dev address(0) to disable validation.
     */
    function setTransferValidator(address transferValidator_) external onlyRoles(TRANSFER_VALIDATOR_MANAGER_ROLE) {
        address oldValidator = transferValidator;
        transferValidator = transferValidator_;

        emit TransferValidatorUpdated(oldValidator, transferValidator_);
    }

    /**
     * @dev Sets the ERC2981 royalty information for the token collection.
     * @param receiver The address of the royalty recipient.
     * @param feeNumerator The royalty fee numerator.
     */
    function setRoyaltyInfo(address receiver, uint96 feeNumerator) external onlyRoles(ROYALTY_MANAGER_ROLE) {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    /**
     * @notice Burns a token.
     * @param tokenId The token ID.
     * @dev Only the Beacon contract can burn locked tokens, enforced by _beforeTokenTransfer
     * @dev If the token is unlocked, the caller must be the owner or approved.
     */
    function burn(uint256 tokenId) external virtual {
        if (_locked(tokenId)) {
            _burn(tokenId);
        } else {
            _burn(msg.sender, tokenId);
        }
    }

    /**
     * @notice Executes a callback for the specified GUID.
     * @param guid The GUID of the callback.
     */
    function executeCallback(bytes32 guid) external virtual {
        if (msg.sender != BEACON_CONTRACT_ADDRESS) revert CallerNotBeacon();

        address callbackTarget = callbacks[guid];
        if (callbackTarget == address(0)) return;

        delete callbacks[guid];

        IShadowCallbackReceiver(callbackTarget).executeCallback(guid);
    }

    /**
     * @notice Returns whether the token is locked.
     * @param tokenId The token ID.
     * @return bool Whether the token is locked.
     */
    function locked(uint256 tokenId) external view returns (bool) {
        return _locked(tokenId);
    }

    /**
     * @notice Returns whether the contract supports the specified interface.
     * @param interfaceId The interface ID.
     * @return bool Whether the contract supports the interface.
     * @dev ERC721 and ERC2981 are supported.
     */
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return interfaceId == type(IERC5192).interfaceId || ERC721.supportsInterface(interfaceId)
            || ERC2981.supportsInterface(interfaceId) || interfaceId == bytes4(0x49064906);
    }

    /**
     * @notice Returns the token URI for the specified token ID.
     * @param id The token ID.
     * @return The token URI.
     * @dev If the metadataRenderer is set, it will be used to render the token URI.
     */
    function tokenURI(uint256 id) public view virtual override returns (string memory) {
        if (!_exists(id)) revert TokenDoesNotExist();

        if (metadataRenderer != address(0)) {
            return ERC721(metadataRenderer).tokenURI(id);
        }

        return LibString.concat(_baseTokenUri, LibString.toString(id));
    }

    /**
     * @notice Returns the name of the collection.
     * @return _name the name of the collection.
     */
    function name() public view virtual override returns (string memory) {
        return _name;
    }

    /**
     * @notice Returns the symbol of the collection.
     * @return _symbol the symbol of the collection.
     */
    function symbol() public view virtual override returns (string memory) {
        return _symbol;
    }

    /**
     * @notice Returns the token IDs of the tokens owned by the specified owner in a range.
     * @dev 10k collections should be able to get all their tokens in a single call, larger collections may need pagination.
     * @dev Intended for offchain use, do not use onchain.
     * @param owner The address of the owner.
     * @param start The range start.
     * @param stop The range stop.
     * @return array of token IDs owned by the specified owner.
     */
    function tokensOfOwnerIn(address owner, uint256 start, uint256 stop) external view returns (uint256[] memory) {
        return _tokensOfOwnerIn(owner, start, stop);
    }

    /**
     * @notice Returns the ERC721C transfer validator address. address(0) indicates no validator is set.
     * @return address The address of the transfer validator.
     */
    function getTransferValidator() external view returns (address) {
        return transferValidator;
    }

    /**
     * @notice Returns the ERC721C transfer validation function signature and whether it is a view function.
     * @return functionSignature The 4 byte function signature.
     * @return isViewFunction Bool indicating if the function is a view function.
     */
    function getTransferValidationFunction() external pure returns (bytes4 functionSignature, bool isViewFunction) {
        functionSignature = 0xcaee23ea;
        isViewFunction = true;
    }

    function _read(uint256[] calldata tokenIds, uint32[] calldata dstEids, uint128 callbackGasLimit)
        internal
        returns (bytes32)
    {
        address baseCollectionAddress = IBeacon(BEACON_CONTRACT_ADDRESS).shadowToBase(address(this));
        return IBeacon(BEACON_CONTRACT_ADDRESS).read{value: msg.value}(
            baseCollectionAddress, tokenIds, dstEids, msg.sender, callbackGasLimit
        );
    }

    /**
     * @notice Unlocks the specified token ID.
     * @param tokenId The token ID to unlock.
     * @param beneficiary The address of the beneficiary of the unlocked token, in case ownership is stale.
     * @dev Only the Beacon contract can unlock tokens
     */
    function _unlockToken(uint256 tokenId, address beneficiary) internal {
        if (_locked(tokenId)) {
            address owner = _ownerOf(tokenId);

            // mint if there is no previous owner, otherwise transfer
            if (owner == address(0)) {
                _mint(beneficiary, tokenId);
            } else if (beneficiary != owner) {
                _transfer(address(0), owner, beneficiary, tokenId);
            }

            _setExtraData(tokenId, UNLOCKED);

            emit Unlocked(tokenId);
        } else {
            revert TokenNotLocked();
        }
    }

    function _tokensOfOwnerIn(address owner, uint256 start, uint256 stop) internal view returns (uint256[] memory) {
        uint256 numberOfTokens = balanceOf(owner);
        uint256 tokenIdIdx = 0;
        uint256[] memory tokenIds = new uint256[](numberOfTokens);

        for (uint256 i = start; i <= stop; i++) {
            if (_ownerOf(i) == owner) {
                tokenIds[tokenIdIdx] = i;

                unchecked {
                    tokenIdIdx++;
                }

                if (tokenIdIdx == numberOfTokens) {
                    return tokenIds;
                }
            }
        }

        // in case we did not find all the tokens within this start/stop, we need to resize the array
        uint256[] memory result = new uint256[](tokenIdIdx);
        for (uint256 i = 0; i < tokenIdIdx; i++) {
            result[i] = tokenIds[i];
        }

        return result;
    }

    // tokens can only be transferred if they are locked on the source chain
    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal view override {
        if (msg.sender != BEACON_CONTRACT_ADDRESS) {
            if (_locked(tokenId) || from == address(0)) {
                revert CallerNotBeacon();
            }

            if (transferValidator != address(0)) {
                ITransferValidator(transferValidator).validateTransfer(msg.sender, from, to, tokenId);
            }
        }
    }

    function _locked(uint256 tokenId) internal view returns (bool) {
        return _getExtraData(tokenId) == LOCKED;
    }

    function _guardInitializeOwner() internal pure override returns (bool) {
        return true;
    }

    function _calldataload(uint256 offset) internal pure returns (uint256 value) {
        /// @solidity memory-safe-assembly
        assembly {
            value := calldataload(offset)
        }
    }

    function _shadowFallback() internal {
        uint256 fnSelector = _calldataload(0x00) >> 224;

        if (fnSelector == 0x40c10f19) {
            // msg.sender is the Beacon contract, enforced by _beforeTokenTransfer
            _mint(address(uint160(_calldataload(0x04))), _calldataload(0x24));
        } else if (fnSelector == 0x92772833) {
            if (msg.sender != BEACON_CONTRACT_ADDRESS) revert CallerNotBeacon();

            uint256 tokenIdsLength = _calldataload(0x44);
            address beneficiary = address(uint160(_calldataload(0x24)));

            for (uint256 i = 0; i < tokenIdsLength; i++) {
                _unlockToken(_calldataload(0x64 + i * 32), beneficiary);
            }
        } else {
            revert FnSelectorNotRecognized();
        }
    }
}
