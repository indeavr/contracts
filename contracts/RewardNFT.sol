//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {ERC721URIStorage} from '@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol';
import {ERC721} from '@openzeppelin/contracts/token/ERC721/ERC721.sol';

contract CollectibleNft is ERC721URIStorage, Ownable {
    uint256 public tokenCounter;
    uint256 public tokenSupply;

    address public LOYAL_ADDRESS;
    address public KEEPER_ADDRESS;
    address public MARKETPLACE_ADDRESS;

    enum Rarity {
        AMETHYST_ZEPPELIN,
        OPAL_ZEPPELIN,
        DIAMOND_ZEPPELIN,
        WARP_ZEPPELIN
    }

    /* Each Rarity Has Certain Properties */
    struct Properties {
        uint256 step;
        uint256 max;
        uint256 counter;
        uint256 nextMulti;
        string uri;
    }

    /* Mappings */
    mapping(uint256 => CollectibleInfo) public collectibles;
    mapping(address => uint256[]) public accountToCollectible;
    mapping(Rarity => Properties) public rarityToProp;

    /* Each Collectible has certain details */
    struct CollectibleInfo {
        address owner;
        address minter;
        uint256 royalId;
        uint256 id;
        Rarity rarity;
    }

    /* MAX SUPPLY */
    uint256 constant MAX_MINT = 445;

    /* EVENTS */
    event CollectibleFound(address _owner, uint256 _tokenId, uint256 _royalId);
    event CollectibleNotFound(address _owner, uint256 _royalId);
    event CollectibleTeleported(
        address _previousOwner,
        address _newOwner,
        uint256 _tokenID,
        uint256 blockNumber,
        uint256 timeStamp
    );
    event CollectibleSpecialReward(
        address _owner,
        uint256 _tokenId,
        uint256 _royalId
    );
    event CollectibleConsumed(uint256 _tokenId, uint256 _royalId);

    constructor(address _royalAdd, address _keeperAdd)
        ERC721('ZeppelinCollectibleNFT', 'CollectibleNFT')
    {
        tokenCounter = 0;
        tokenSupply = 0;
        KEEPER_ADDRESS = _keeperAdd;
        LOYAL_ADDRESS = _royalAdd;
        // n'TH Loyal id (3000 max) -> total number collectible minted
        // 430 --> 7 mint (+3 dev) - max 10
        // 100 --> 30 mint (+5 dev) - max 35
        // 50 --> 60 mint (+10 dev) - max 70
        // 10 --> 300 mint (+30 dev) - max 330
        rarityToProp[Rarity.AMETHYST_ZEPPELIN] = Properties({
            step: 10,
            max: 330,
            counter: 0,
            nextMulti: 1,
            uri: 'ipfs/'
        });
        rarityToProp[Rarity.OPAL_ZEPPELIN] = Properties({
            step: 50,
            max: 70,
            counter: 0,
            nextMulti: 1,
            uri: 'ipfs/'
        });
        rarityToProp[Rarity.DIAMOND_ZEPPELIN] = Properties({
            step: 100,
            max: 35,
            counter: 0,
            nextMulti: 1,
            uri: 'ipfs/'
        });
        rarityToProp[Rarity.WARP_ZEPPELIN] = Properties({
            step: 430,
            max: 10,
            counter: 0,
            nextMulti: 1,
            uri: 'ipfs/'
        });
    }

    /* --------- MODIFIERS --------- */
    modifier onlyLoyal() {
        require(msg.sender == LOYAL_ADDRESS, 'UnAuth');
        _;
    }

    modifier onlyKeeper() {
        require(msg.sender == KEEPER_ADDRESS, 'UnAuth');
        _;
    }

    modifier onlyMarketplace() {
        require(msg.sender == MARKETPLACE_ADDRESS, 'UnAuth');
        _;
    }

    /* --------- Mint NFT --------- */

    /*
        [Entry point] Creation.
        Called on LoyalNft creation and mints only if the Loyal ID is a certain number (n'th)
        Each rarity has a certain divisor.
        1. Multiply id by 10k.
        2. Cycle through all rarities (starting from the last one WarpZeppelin)
        * ONLY 1 rarity can be minted (ex: 100th loy NFT will mint a Diamond and NO Opal/Amethyst)
        * However a @nextMulti for each rarity is kept in order to calculate the correct "remainder"
        3. if rarity.nextMulti * 10k == id * 10k / step --> Mints and increases nextMulti for all rarities below (@didMint)
    */
    function create(address _account, uint256 _royalId) external onlyLoyal {
        if (tokenSupply < MAX_MINT) {
            uint256 base = 10000;
            // since int division can't produce a remainder
            uint256 buffedLoyal = _royalId * base;

            bool didMint;
            Properties memory currentProp;
            // otherwise j goes negative on final for cycle (exception).
            uint256 i;
            for (uint256 j = uint256(Rarity.WARP_ZEPPELIN) + 1; j > 0; j--) {
                i = j - 1;
                currentProp = rarityToProp[Rarity(i)];
                if (
                    currentProp.counter != currentProp.max &&
                    (buffedLoyal / currentProp.step) ==
                    base * (currentProp.nextMulti)
                ) {
                    if (didMint) {
                        rarityToProp[Rarity(i)].nextMulti++;
                    } else {
                        didMint = true;
                        rarityToProp[Rarity(i)].nextMulti++;
                        _createCollectible(_royalId, _account, Rarity(i));
                        emit CollectibleSpecialReward(_account, _royalId, i);
                    }
                }
            }
        }
    }

    /* [Actual] Creation (internal) */
    function _createCollectible(
        uint256 _royalId,
        address _account,
        Rarity _rarity
    ) internal {
        uint256 newItemId = tokenCounter + 1;

        CollectibleInfo memory nftInfo = CollectibleInfo({
            owner: _account,
            minter: _account,
            id: newItemId,
            royalId: _royalId,
            rarity: _rarity
        });

        // State Update
        collectibles[newItemId] = nftInfo;
        accountToCollectible[_account].push(newItemId);
        tokenCounter++;
        tokenSupply++;
        rarityToProp[_rarity].counter++;

        // Mint
        super._safeMint(_account, newItemId);
        super._setTokenURI(newItemId, rarityToProp[_rarity].uri);

        emit CollectibleFound(_account, newItemId, _royalId);
    }

    /*
        [Dev Giveaway] Creation.
        Used by DEVs to fund Giveaways/Marketing etc ...
        Devs have around 10% of each rarity to mint until MAX supply is reached.
    */
    function createSpecialReward(
        uint256 _royalId,
        address _account,
        uint256 _rarity
    ) external onlyOwner {
        Properties memory currentProp = rarityToProp[Rarity(_rarity)];
        if (currentProp.counter < currentProp.max) {
            _createCollectible(_royalId, _account, Rarity(_rarity));
            emit CollectibleSpecialReward(_account, _royalId, _rarity);
        } else {
            emit CollectibleNotFound(_account, _royalId);
        }
    }

    /* Overridden in order to update the custom storage collections when ownership changes */
    function _transfer(
        address from,
        address to,
        uint256 tokenId
    ) internal virtual override(ERC721) {
        super._transfer(from, to, tokenId);

        removeCollectibleAt(from, tokenId);
        accountToCollectible[to].push(tokenId);
        collectibles[tokenId].owner = to;

        emit CollectibleTeleported(
            from,
            to,
            tokenId,
            block.number,
            block.timestamp
        );
    }

    /*
        Called by Keeper.sol on @withdrawWithZeppelinCollectible. (leave)
        User uses collectible to reduce the Keeper withdraw protocol fee.
        Transfers Collectible NFT to Keeper Contract.
        Can be redeemed by DEVs in Keeper.sol by calling @teleportCollectible.
    */
    function consumeArtifact(uint256 _artifactId) external onlyKeeper {
        _transfer(
            collectibles[_artifactId].owner,
            address(KEEPER_ADDRESS),
            _artifactId
        );
        emit CollectibleConsumed(
            _artifactId,
            collectibles[_artifactId].royalId
        );
    }

    /* Cant burn, sorry */
    function _burn(uint256 tokenId)
        internal
        virtual
        override(ERC721URIStorage)
    {
        tokenId;
        revert('ERROR_CANT_BURN: Collectible-Too-Powerful');
    }

    /* Used by the NFT Marketplace to transfer NFTs from Seller to Buyer */
    function marketTransfer(
        address from,
        address to,
        uint256 tokenId
    ) external onlyMarketplace {
        _transfer(from, to, tokenId);
    }

    /*
        Removes a tokenId from @accountToArtifacts[_account] array
        by shifting the elements after the target by 1 index backwards then popping the final element.
    */
    function removeCollectibleAt(address _account, uint256 _tokenId)
        internal
        returns (bool)
    {
        uint256 length = accountToCollectible[_account].length;

        if (length == 0) {
            return false;
        }

        if (accountToCollectible[_account][length - 1] == _tokenId) {
            accountToCollectible[_account].pop();
            return true;
        }

        bool found = false;
        for (uint256 i = 0; i < length - 1; i++) {
            if (_tokenId == accountToCollectible[_account][i]) {
                found = true;
            }
            if (found) {
                accountToCollectible[_account][i] = accountToCollectible[
                    _account
                ][i + 1];
            }
        }
        if (found) {
            accountToCollectible[_account].pop();
        }
        return found;
    }

    /* --------- GETTERS --------- */
    function hasCollectible(address _account) external view returns (bool) {
        uint256 n = accountToCollectible[_account].length;
        if (n == 0) {
            return false;
        }
        for (uint256 i = 0; i < n; i++) {
            if (accountToCollectible[_account][i] != 0) {
                return true;
            }
        }
        return false;
    }

    function hasCollectibleId(address _account, uint256 _tokenId)
        external
        view
        returns (bool)
    {
        return collectibles[_tokenId].owner == _account;
    }

    function totalSupply() external view returns (uint256) {
        return tokenSupply;
    }

    function getMinter(uint256 _tokenId) external view returns (address) {
        return collectibles[_tokenId].minter;
    }

    function getRarity(uint256 _tokenId) external view returns (uint256) {
        return uint256(collectibles[_tokenId].rarity);
    }

    function getIdsForAccount(address _acc)
        external
        view
        returns (uint256[] memory ids)
    {
        ids = accountToCollectible[_acc];
        return ids;
    }

    function getOwnerOfNftID(uint256 _tokenId) external view returns (address) {
        return collectibles[_tokenId].owner;
    }

    /* --------- SETTERS --------- */
    function setMarketplaceAddress(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address !');
        MARKETPLACE_ADDRESS = _addy;
    }

    function setLoyalContract(address _loyNftAddress) external onlyOwner {
        require(_loyNftAddress != address(0), 'Zero address !');
        LOYAL_ADDRESS = _loyNftAddress;
    }

    function setKeeperContract(address _keeperAddress) external onlyOwner {
        require(_keeperAddress != address(0), 'Zero address !');
        KEEPER_ADDRESS = _keeperAddress;
    }
}
