// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity ^0.8.2;

import "@layerzerolabs/solidity-examples/contracts/contracts-upgradable/token/ONFT721/ONFT721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

interface IStreamer {
    function stream(address _from, address _to, uint256 _tokenId) external;
    function token() external returns(address);
}

contract Farcraft is Initializable, ONFT721Upgradeable, ERC721BurnableUpgradeable, ERC721VotesUpgradeable, AccessControlUpgradeable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    string private baseURI;
    IStreamer streamer;
    uint16 streamChainId;

    struct Category {
        string name;
        uint nextMintId;
        uint maxMintId;
        bool publicMint;
        uint mintPrice;
    }
    mapping(uint => Category) public categories;

    function initialize(string memory _name, string memory _symbol, address _lzEndpoint, address sender, uint16[] memory remoteChainIds, address _streamer, uint16 _streamChainId, string calldata _uri) public initializer {
        __ONFT721UpgradeableMock_init(_name, _symbol, _lzEndpoint);
        baseURI = _uri;
        streamer = IStreamer(_streamer);
        streamChainId = _streamChainId;
        _transferOwnership(sender);
        _grantRole(DEFAULT_ADMIN_ROLE, sender);
        _grantRole(MINTER_ROLE, sender);
        for(uint i = 0; i < remoteChainIds.length; i++) {
            trustedRemoteLookup[remoteChainIds[i]] = abi.encodePacked(address(this), address(this));
        }
    }

    function __ONFT721UpgradeableMock_init(string memory _name, string memory _symbol, address _lzEndpoint) internal onlyInitializing {
        __Ownable_init();
        __ONFT721Upgradeable_init(_name, _symbol, _lzEndpoint);
    }

    function __ONFT721UpgradeableMock_init_unchained(string memory _name, string memory _symbol, address _lzEndpoint) internal onlyInitializing {}

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }
    function setBaseURI(string calldata _uri) external onlyRole(DEFAULT_ADMIN_ROLE) {
        baseURI = _uri;
    }

    function mint(address to, uint categoryId) external payable {
        Category memory category = categories[categoryId];
        require(
            category.maxMintId != 0 &&
            (category.nextMintId <= category.maxMintId),
             "!C"
        );

        require(
            hasRole(MINTER_ROLE, msg.sender) ||
            (
                category.publicMint &&
                msg.value >= category.mintPrice
            ),
            "!R"
        );

        uint tokenId = category.nextMintId;
        category.nextMintId++;

        _safeMint(to, tokenId);
        //_setTokenURI(tokenId, uri);
        //_startStream(tokenId);
    }

    function addOrUpdateCategory(uint _id, Category memory _category) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // @dev (off-chain!) validation is left to the (admin) sender -- be careful with overriding existing tokenId ranges
        categories[_id] = _category;
    }

    function evmEstimateSendFee(uint16 _dstChainId, address _from, address _to, uint _tokenId) public view returns (uint nativeFee, uint zroFee) {
        return lzEndpoint.estimateFees(
            _dstChainId, 
            address(this), 
            abi.encode(_from, abi.encodePacked(_to), _tokenId, false), 
            false, 
            ""
        );
    }

    // @dev convenience method
    function evmSend(uint16 _dstChainId, uint _tokenId) public payable {
        require(ERC721Upgradeable.ownerOf(_tokenId) == msg.sender);
        _send(msg.sender, _dstChainId, abi.encodePacked(msg.sender), _tokenId, payable(msg.sender), address(0), "");
    }

    function _send(address _from, uint16 _dstChainId, bytes memory _toAddress, uint _tokenId, address payable, address, bytes memory) internal virtual override {
        //_debitFrom(_from, _dstChainId, _toAddress, _tokenId);
        _burn(_tokenId);
        _lzSend(
            _dstChainId, 
            abi.encode(_from, _toAddress, _tokenId, false), 
            payable(msg.sender), 
            address(0), 
            ""
        );
        uint64 nonce = lzEndpoint.getOutboundNonce(_dstChainId, address(this));
        emit SendToChain(_from, _dstChainId, _toAddress, _tokenId, nonce);
    }

    function _nonblockingLzReceive(uint16 _srcChainId, bytes memory _srcAddress, uint64 _nonce, bytes memory _payload) internal virtual override {
        (address from, bytes memory toAddressBytes, uint tokenId, bool redirectStream) = abi.decode(_payload, (address, bytes, uint, bool));
        address toAddress;
        assembly {
            toAddress := mload(add(toAddressBytes, 20))
        }
        if (redirectStream) {
            // @dev a token was transferred to another address on another chain, so update the streams if streamer on this chain
            if (address(streamer) != address(0)) {
                streamer.stream(from, toAddress, tokenId);
            }
        } else {
            // @dev this is a token being received from another chain
            //_creditTo(_srcChainId, toAddress, tokenId);
            require(!_exists(tokenId));
            _safeMint(toAddress, tokenId);
            emit ReceiveFromChain(_srcChainId, _srcAddress, toAddress, tokenId, _nonce);
        }
    }

    //function _creditTo(uint16, address _toAddress, uint _tokenId) internal override {
    //    require(!_exists(_tokenId));
    //    _safeMint(_toAddress, _tokenId);
    //}
    //function _creditTo(uint16, address, uint) internal override {}
    //function _debitFrom(address, uint16, bytes memory, uint) internal override {}

    function _beforeTokenTransfer(
        address oldReceiver,
        address newReceiver,
        uint256 tokenId,
        uint256 batchSize
    ) internal override {
        super._beforeTokenTransfer(oldReceiver, newReceiver, tokenId, batchSize);
        if ( newReceiver != address(0) ) {
            if (address(streamer) != address(0)) {
                streamer.stream(oldReceiver, newReceiver, tokenId);
            } else {
                if (streamChainId != uint16(0)) {
                     _lzSend(
                        streamChainId, 
                        abi.encode(oldReceiver, abi.encodePacked(newReceiver), tokenId, true), 
                        payable(msg.sender), 
                        address(0), 
                        ""
                    );
                }
            }
        }
    }

    function _afterTokenTransfer(
        address oldReceiver,
        address newReceiver,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721Upgradeable, ERC721VotesUpgradeable) {
        return super._afterTokenTransfer(oldReceiver, newReceiver, tokenId, batchSize);
    }

    /**
     * @notice The URI of contract-level metadata for OpenSea, etc.
     */
    function contractURI() external view returns (string memory) {
        return string(abi.encodePacked(baseURI, 'contract.json'));
    }

    // The following functions are overrides required by Solidity.

    function _burn(uint256 tokenId) internal override(ERC721Upgradeable) {
        super._burn(tokenId);
    }

    function withdraw() external onlyRole(DEFAULT_ADMIN_ROLE) {
        payable(msg.sender).transfer(address(this).balance);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, ONFT721Upgradeable, AccessControlUpgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }


    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint[50] private __gap;
}