//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

interface IZenERC20 {
    function ownerOf(uint256 _tokenId) external view returns (address);

    function balanceOf(address _addr) external view returns (uint256);

    function getMinter(uint256 _tokenId) external view returns (address);

    function marketTransfer(
        address _from,
        address _to,
        uint256 _nftId
    ) external;
}

interface IZenNFT {
    function getLastMintBlock() external view returns (uint256);

    function getIdForAccount(address _acc) external view returns (uint256);

    function receiveRewards(uint256 _dividendRewards) external;

    function burnToClaim() external;

    function create(address _account, uint256 _minReq)
        external
        returns (uint256);

    function getUnclaimed(address _account) external returns (uint256);

    function canMint(address _account) external view returns (bool);

    function getMinReq(uint256 _tokenId) external returns (uint256);

    function getIds() external view returns (uint256[] memory);

    function balanceOf(address owner) external view returns (uint256 balance);

    function ownerOf(uint256 tokenId) external view returns (address owner);

    function totalSupply() external view returns (uint256);

    function getOpenZenSpotsCount() external view returns (uint256);

    function getZenSpotAt(uint256 _tokenId)
        external
        view
        returns (
            uint256,
            uint256,
            address,
            uint256,
            uint256
        );

    function myInfo()
        external
        view
        returns (
            uint256 rank,
            uint256 rewards,
            uint256 startMinReq,
            uint256 id,
            uint256 mintBlock
        );

    function getInfo(address _account)
        external
        view
        returns (
            uint256 rank,
            uint256 level,
            uint256 id
        );
}

interface IRoyaltyNFT {
    function handleBuy(
        address _account,
        uint256 _amountETH,
        uint256 _tokenAmount
    ) external;

    function getInfo(address _account)
        external
        view
        returns (
            uint256 rank,
            uint256 level,
            uint256 id
        );

    function handleSold(address _account) external;

    function claim() external;

    function balanceOf(address owner) external view returns (uint256 balance);

    function totalSupply() external view returns (uint256);

    function ownerOf(uint256 tokenId) external view returns (address owner);

    function receiveRewards(uint256 _reward) external;

    function myInfoFull()
        external
        view
        returns (
            uint256 rank,
            uint256 level,
            uint256 possibleClaimAmount,
            uint256 blocksLeftToClaim,
            uint256 buyVolumeETH,
            uint256 sellVolumeETH,
            uint256 lastLevelUpVolume,
            uint256 claimedRewards
        );

    function getIdForAccount(address _acc) external view returns (uint256);

    function getBlocksUntilClaim(address _account) external returns (uint256);

    function getRights(uint256 _tokenId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function getNextRankRights(uint256 _tokenId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function canEvolve(address _account) external returns (bool);

    function getClaimBlock(address _account) external returns (uint256);

    function canMint(address _account) external view returns (bool);

    function create(
        address _account,
        uint256 _buyVolume,
        uint256 _amount
    ) external returns (uint256 tokenId);

    function getMintPriceETH() external view returns (uint256);

    function getNextMintPriceETH() external view returns (uint256);

    function syncFund() external;
}

interface ICollectibleNFT {
    function create(address _account, uint256 _royalId) external;

    function getRarity(uint256 _tokenId) external view returns (uint256);
}

interface IRewardNFT {
    function create(address _account, uint256 _zenSpotId) external;

    function balanceOf(address account) external view returns (uint256);
}

interface IHelper {
    function getRarity(
        address _nftContract,
        uint256 _nftId,
        address _account
    ) external view returns (uint256 currentRank);

    function canOwn(
        address _nftContract,
        uint256 _nftId,
        address _account
    ) external view returns (bool can);
}

contract Marketplace is Ownable {
    /*************
     * Constants *
     *************/
    uint256 public PROTOCOL_LISTING_FEE;
    uint256 public PROTOCOL_BUYING_FEE;
    uint256 public ROYALTY_FEE;

    uint256 public MIN_PRICE;

    uint256 public BID_WITHDRAW_CD;
    uint256 public MAX_OFFER_BLOCKS;

    /*************
     * Variables *
     *************/

    struct Offer {
        uint256 nftId;
        IZenERC20 nftContract;
        address seller;
        uint256 startPrice;
        uint256 instantBuyPrice;
        uint256 rarity;
        uint256 madeBlock;
        uint256 expiryBlock;
    }

    struct Bid {
        Offer offer;
        address bidder;
        uint256 amount;
        uint256 madeBlock;
    }

    // nftContract -> nftId
    mapping(IZenERC20 => mapping(uint256 => Offer)) public offers;
    mapping(IZenERC20 => mapping(uint256 => Bid)) public bids;

    IZenERC20[] public whitelist;
    mapping(IZenERC20 => uint256[]) public contractToIds;

    IHelper public Helper;

    /* Used in Getters */
    struct OfferPreview {
        uint256 nftId;
        IZenERC20 nftContract;
        uint256 madeBlock;
        uint256 bidPrice;
        uint256 instantBuyPrice;
        uint256 rarity;
    }

    /**********
     * Events *
     **********/

    event NewOffer(
        IZenERC20 nftContract,
        uint256 nftId,
        address seller,
        uint256 startPrice,
        uint256 instantBuyPrice,
        uint256 rarity,
        uint256 expiryBlock
    );
    event NewBid(
        IZenERC20 nftContract,
        uint256 nftId,
        address oldBidder,
        address newBidder,
        uint256 oldAmount,
        uint256 newAmount
    );
    event AcceptedOffer(
        IZenERC20 nftContract,
        uint256 nftId,
        address seller,
        address buyer,
        uint256 amount
    );
    event InstantBought(
        IZenERC20 nftContract,
        uint256 nftId,
        address seller,
        address buyer,
        uint256 amount
    );

    event RemovedOffer(
        IZenERC20 nftContract,
        uint256 nftId,
        address seller,
        uint256 startPrice
    );
    event Refunded(
        IZenERC20 nftContract,
        uint256 nftId,
        address bidder,
        uint256 bidAmount
    );
    event WithdrawnBid(
        IZenERC20 nftContract,
        uint256 nftId,
        address bidder,
        uint256 amount
    );

    event DistributedProtocolFee(
        IZenERC20 fromNftContract,
        uint256 _fromNftId,
        uint256 _amount
    );
    event DistributedRoyalty(
        IZenERC20 nftContract,
        uint256 nftId,
        address _toMinter,
        uint256 _amount
    );
    event OwnershipChanged(
        IZenERC20 nftContract,
        uint256 nftId,
        address _from,
        address _to,
        uint256 _amount
    );

    event Purged(IZenERC20 nftContract, uint256 nftId, bool ownershipChanged);
    event ExtendedOffer(
        IZenERC20 nftContract,
        uint256 nftId,
        uint256 newExpiryBlock,
        uint256 extendedWith
    );

    constructor(address _helperAddr) {
        Helper = IHelper(_helperAddr);

        MIN_PRICE = 5e17;

        PROTOCOL_LISTING_FEE = 1e16;
        // 2%, 3%
        PROTOCOL_BUYING_FEE = 200;
        ROYALTY_FEE = 300;

        // 3h
        BID_WITHDRAW_CD = 1200 * 3;

        // ~ 2 months
        MAX_OFFER_BLOCKS = 28800 * 60;
    }

    /**********************
     * Function Modifiers *
     **********************/

    uint256 private unlocked = 1;
    modifier antiReentrant() {
        require(unlocked == 1, 'ERROR: Anti-Reentrant');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    modifier onlyWhitelisted(IZenERC20 _nftContract) {
        require(address(_nftContract) != address(0), 'ERROR: Zero address');
        require(this.inWhitelist(_nftContract), 'ERROR: Not Whitelisted');
        _;
    }

    function inWhitelist(IZenERC20 _nftContract) public view returns (bool) {
        uint256 l = whitelist.length;
        if (l == 0) {
            return false;
        }
        for (uint256 i = 0; i < l; i++) {
            if (address(whitelist[i]) == address(_nftContract)) {
                return true;
            }
        }
        return false;
    }

    /* --------- CREATE --------- */
    function offerNftForSale(
        IZenERC20 _nftContract,
        uint256 _nftId,
        uint256 _startPrice,
        uint256 _instantBuyPrice
    ) external payable antiReentrant onlyWhitelisted(_nftContract) {
        require(msg.sender == tx.origin, 'EOA');
        // EXACT FEE not more otherwise STUCK
        require(msg.value == PROTOCOL_LISTING_FEE, 'Not correct listing fee.');
        require(
            offers[_nftContract][_nftId].seller == address(0),
            'Already listed !'
        );

        require(_startPrice < 1e24 && _instantBuyPrice < 1e24, "Don't Troll");

        address ownerOfNftId = _nftContract.ownerOf(_nftId);
        require(msg.sender == ownerOfNftId, 'Not NFT Owner');
        require(ownerOfNftId != address(0), '0 address');

        require(_startPrice >= MIN_PRICE, 'Min. Price');
        require(
            _instantBuyPrice >= _startPrice,
            'Instant Buy Should be bigger than bid start price'
        );

        uint256 rarity = getRarity(address(_nftContract), _nftId, msg.sender);

        // Listing Fee
        payable(this.owner()).transfer(PROTOCOL_LISTING_FEE);

        uint256 expiryBlock = block.number + MAX_OFFER_BLOCKS;
        offers[_nftContract][_nftId] = Offer({
            nftId: _nftId,
            nftContract: _nftContract,
            seller: msg.sender,
            startPrice: _startPrice,
            instantBuyPrice: _instantBuyPrice,
            madeBlock: block.number,
            expiryBlock: expiryBlock,
            rarity: rarity
        });

        contractToIds[_nftContract].push(_nftId);

        emit NewOffer(
            _nftContract,
            _nftId,
            msg.sender,
            _startPrice,
            _instantBuyPrice,
            rarity,
            expiryBlock
        );
        emit DistributedProtocolFee(_nftContract, _nftId, PROTOCOL_LISTING_FEE);
    }

    /* --------- DELETE --------- */
    function removeOffer(IZenERC20 _nftContract, uint256 _nftId)
        external
        antiReentrant
        onlyWhitelisted(_nftContract)
    {
        require(msg.sender == tx.origin, 'EOA');

        address ownerOfNftId = _nftContract.ownerOf(_nftId);
        require(ownerOfNftId != address(0), '0 address');
        require(msg.sender == ownerOfNftId, 'Not NFT Owner');

        deleteOffer(_nftContract, _nftId);
        refundBidder(_nftContract, _nftId);
    }

    function refundBidder(IZenERC20 _nftContract, uint256 _nftId)
        internal
        returns (bool success)
    {
        Bid memory bid = bids[_nftContract][_nftId];
        if (bid.amount > 0) {
            payable(bid.bidder).transfer(bid.amount);

            delete bids[_nftContract][_nftId];

            emit Refunded(_nftContract, _nftId, bid.bidder, bid.amount);
            return true;
        }

        return false;
    }

    function deleteOffer(IZenERC20 _nftContract, uint256 _nftId) internal {
        Offer memory offer = offers[_nftContract][_nftId];

        delete offers[_nftContract][_nftId];

        bool success = removeOfferAt(_nftContract, _nftId);
        require(success, "wasn't able to remove");

        emit RemovedOffer(_nftContract, _nftId, offer.seller, offer.startPrice);
    }

    function removeOfferAt(IZenERC20 _nftContract, uint256 _nftId)
        internal
        returns (bool)
    {
        uint256 length = contractToIds[_nftContract].length;

        if (length == 0) {
            return false;
        }

        if (contractToIds[_nftContract][length - 1] == _nftId) {
            contractToIds[_nftContract].pop();
            return true;
        }

        bool found = false;
        for (uint256 i = 0; i < length - 1; i++) {
            if (contractToIds[_nftContract][i] == _nftId) {
                found = true;
            }
            if (found) {
                contractToIds[_nftContract][i] = contractToIds[_nftContract][
                    i + 1
                ];
            }
        }
        if (found) {
            contractToIds[_nftContract].pop();
        }
        return found;
    }

    /* --------- BUY & BID --------- */
    function buyNft(IZenERC20 _nftContract, uint256 _nftId)
        external
        payable
        antiReentrant
    {
        require(msg.sender == tx.origin, 'EOA');
        Offer memory offer = offers[_nftContract][_nftId];
        require(offer.seller != msg.sender, 'Cant buy your own offer');

        bool canOwn = Helper.canOwn(address(_nftContract), _nftId, msg.sender);
        require(canOwn, 'Your account cant own any more nfts of this type !');

        (
            uint256 amountToSeller,
            uint256 amountFromBuyer,
            uint256 serviceFee,
            uint256 royaltyFee
        ) = this.getFinalBuyPrice(_nftContract, _nftId);

        require(msg.value == amountFromBuyer, 'Not exact instantBuy price');

        // 1) Send NFT, 2) Send Fees
        transferNftAndFees(
            _nftContract,
            _nftId,
            serviceFee,
            royaltyFee,
            offer.seller,
            msg.sender
        );
        payable(offer.seller).transfer(amountToSeller);

        deleteOffer(_nftContract, _nftId);
        refundBidder(_nftContract, _nftId);

        emit InstantBought(
            _nftContract,
            _nftId,
            offer.seller,
            msg.sender,
            msg.value
        );
    }

    function enterBid(IZenERC20 _nftContract, uint256 _nftId)
        external
        payable
        antiReentrant
    {
        require(msg.value > MIN_PRICE, 'No value');
        require(msg.value < 1e24, 'ERROR_TOO_MUCH_FOMO');
        require(msg.sender == tx.origin, 'EOA');
        Offer memory offer = offers[_nftContract][_nftId];
        Bid memory existingBid = bids[_nftContract][_nftId];

        // Get Minimum Bid For NFT
        // if no bid, existing is 0
        require(
            msg.value > this.getMinimumBidAmount(_nftContract, _nftId),
            'Less than current bid or starting price'
        );
        require(offer.seller != msg.sender, 'Cant bid on your offers !');

        bool canOwn = Helper.canOwn(address(_nftContract), _nftId, msg.sender);
        require(canOwn, 'Your account cant own any more nfts of this type !');

        // Refund the PREVIOUS bid
        if (existingBid.bidder != address(0)) {
            payable(existingBid.bidder).transfer(existingBid.amount);
            emit Refunded(
                _nftContract,
                _nftId,
                existingBid.bidder,
                existingBid.amount
            );
        }
        bids[_nftContract][_nftId].bidder = msg.sender;
        bids[_nftContract][_nftId].amount = msg.value;
        bids[_nftContract][_nftId].madeBlock = block.number;

        //protocol fee is included in msg.value
        emit NewBid(
            _nftContract,
            _nftId,
            existingBid.bidder,
            msg.sender,
            existingBid.amount,
            msg.value
        );

        // If bid price >= Instant Buy Price => Make Buy Automatically
        uint256 instBuyPrice = offer.instantBuyPrice;
        if (msg.value >= instBuyPrice) {
            handleAccept(
                _nftContract,
                _nftId,
                instBuyPrice,
                offer.seller,
                msg.sender
            );

            emit InstantBought(
                _nftContract,
                _nftId,
                offer.seller,
                msg.sender,
                instBuyPrice
            );
            uint256 toRefundIfAny = msg.value - instBuyPrice;
            if (toRefundIfAny > 10000 wei) {
                payable(msg.sender).transfer(toRefundIfAny);
            }
        } else {
            // max = 7h
            uint256 maxExtendedToBlock = offer.madeBlock +
                MAX_OFFER_BLOCKS +
                7200;

            uint256 extendBlocks = 200;
            // If Bid is made in last 200blocks before expiry
            // And is before max extend period
            // Increase offer expiry by 10 minutes
            // Untill Max Extend Block Reached
            if (
                block.number >= offer.expiryBlock - extendBlocks &&
                offer.expiryBlock + extendBlocks <= maxExtendedToBlock
            ) {
                offers[_nftContract][_nftId].expiryBlock =
                    offer.expiryBlock +
                    extendBlocks;
                emit ExtendedOffer(
                    _nftContract,
                    _nftId,
                    offers[_nftContract][_nftId].expiryBlock,
                    extendBlocks
                );
            }
        }
    }

    /* Sends NFT & Distributes fees */
    function transferNftAndFees(
        IZenERC20 _nftContract,
        uint256 _nftId,
        uint256 _serviceFee,
        uint256 _royaltyFee,
        address _from,
        address _to
    ) internal {
        IZenERC20 NftContract = IZenERC20(_nftContract);

        // Royalty Payout
        address minter = NftContract.getMinter(_nftId);
        payable(minter).transfer(_royaltyFee);

        // Service Fee
        payable(this.owner()).transfer(_serviceFee);

        // Send Nft to msg.sender [ buyer ]
        NftContract.marketTransfer(_from, _to, _nftId);

        // Ensure transfer from worked
        // Ensure ownership is changed
        address newOwner = NftContract.ownerOf(_nftId);
        require(newOwner == _to, "Buyer didn't receive his NFT");

        emit DistributedProtocolFee(_nftContract, _nftId, _serviceFee);
        emit DistributedRoyalty(_nftContract, _nftId, minter, _royaltyFee);
    }

    function acceptBid(IZenERC20 _nftContract, uint256 _nftId)
        external
        antiReentrant
    {
        Offer memory offer = offers[_nftContract][_nftId];
        require(msg.sender == offer.seller, 'Not your offer !');

        address nftOwner = _nftContract.ownerOf(_nftId);
        require(nftOwner != address(0), '0 address');
        require(msg.sender == nftOwner, 'Not NFT Owner');

        Bid memory bid = bids[_nftContract][_nftId];

        require(bid.amount > 0, 'No bids');
        handleAccept(
            _nftContract,
            _nftId,
            bid.amount,
            offer.seller,
            bid.bidder
        );
    }

    function autoAcceptBid(IZenERC20 _nftContract, uint256 _nftId)
        external
        antiReentrant
    {
        Offer memory offer = offers[_nftContract][_nftId];
        Bid memory bid = bids[_nftContract][_nftId];

        require(bid.amount > 0, 'No bids');
        require(block.number >= offer.expiryBlock, 'Not time yet !');

        handleAccept(
            _nftContract,
            _nftId,
            bid.amount,
            offer.seller,
            bid.bidder
        );
    }

    function handleAccept(
        IZenERC20 _nftContract,
        uint256 _nftId,
        uint256 amount,
        address seller,
        address buyer
    ) internal {
        uint256 serviceFee = (amount * PROTOCOL_BUYING_FEE) / 10000;
        uint256 royaltyFee = (amount * ROYALTY_FEE) / 10000;

        uint256 amountToSeller = amount - royaltyFee - serviceFee;

        deleteOffer(_nftContract, _nftId);
        delete bids[_nftContract][_nftId];

        transferNftAndFees(
            _nftContract,
            _nftId,
            serviceFee,
            royaltyFee,
            seller,
            buyer
        );
        payable(seller).transfer(amountToSeller);

        emit AcceptedOffer(_nftContract, _nftId, seller, buyer, amount);
    }

    function withdrawBid(IZenERC20 _nftContract, uint256 _nftId)
        external
        antiReentrant
    {
        Bid memory bid = bids[_nftContract][_nftId];

        require(bid.bidder == msg.sender, "You're not the bidder !");
        require(
            block.number >= bid.madeBlock + BID_WITHDRAW_CD,
            "Can't withdraw yet !"
        );
        delete bids[_nftContract][_nftId];

        // Refund the bid
        payable(msg.sender).transfer(bid.amount);

        emit WithdrawnBid(_nftContract, _nftId, msg.sender, bid.amount);
    }

    /* --------- PURGE --------- Ensures the safety of the marketplace */
    function getShouldPurge(Offer memory offer)
        external
        view
        returns (
            bool should,
            bool ownership,
            bool rank
        )
    {
        try IZenERC20(offer.nftContract).ownerOf(offer.nftId) returns (
            address theOwner
        ) {
            ownership = offer.seller != theOwner;
            rank =
                offer.rarity !=
                getRarity(
                    address(offer.nftContract),
                    offer.nftId,
                    offer.seller
                );
            should = ownership || rank;

            return (should, ownership, rank);
        } catch {
            return (true, true, false);
        }
    }

    function getPurgeCount() public view returns (uint256 countP) {
        uint256 count;
        uint256 l;
        uint256 id;
        Offer memory offer;
        for (uint256 c = 0; c < whitelist.length; c++) {
            IZenERC20 contr = whitelist[c];
            l = contractToIds[contr].length;
            for (uint256 i = 0; i < l; i++) {
                id = contractToIds[contr][i];
                offer = offers[contr][id];

                (bool should, , ) = this.getShouldPurge(offer);

                if (should) {
                    count++;
                }
            }
        }

        return count;
    }

    function checkPurge()
        external
        view
        returns (
            bool shouldPurge,
            address[] memory contracts,
            uint256[] memory ids
        )
    {
        uint256 l = getPurgeCount();

        if (l == 0) {
            return (false, new address[](0), new uint256[](0));
        }

        address[] memory foundContracts = new address[](l);
        uint256[] memory foundIds = new uint256[](l);

        uint256 count;
        for (uint256 c = 0; c < whitelist.length; c++) {
            IZenERC20 contr = whitelist[c];
            uint256 f = contractToIds[contr].length;
            for (uint256 i = 0; i < f; i++) {
                uint256 id = contractToIds[contr][i];
                Offer memory offer = offers[contr][id];
                (bool should, , ) = this.getShouldPurge(offer);
                if (should) {
                    foundContracts[count] = address(offer.nftContract);
                    foundIds[count] = id;
                    count++;
                }
            }
        }

        return (count != 0, foundContracts, foundIds);
    }

    function purgeOffer(IZenERC20 _nftContract, uint256 _nftId) external {
        Offer memory offer = offers[_nftContract][_nftId];

        (bool should, bool ownership, ) = this.getShouldPurge(offer);

        if (should) {
            deleteOffer(offer.nftContract, _nftId);
            refundBidder(offer.nftContract, _nftId);
            emit Purged(offer.nftContract, _nftId, ownership);
        }
    }

    /* --- GETTERS --- */
    function getRarity(
        address _nftContract,
        uint256 _nftId,
        address _account
    ) public view returns (uint256 currentRank) {
        return Helper.getRarity(_nftContract, _nftId, _account);
    }

    function getOfferMadeBlockAndExpiry(IZenERC20 _nftContract, uint256 _nftId)
        external
        view
        returns (uint256 _madeBlock, uint256 _expiryBlock)
    {
        return (
            offers[_nftContract][_nftId].madeBlock,
            offers[_nftContract][_nftId].expiryBlock
        );
    }

    // Gets the amount of the minimum bid per Nft id
    function getMinimumBidAmount(IZenERC20 _nftContract, uint256 _nftId)
        external
        view
        returns (uint256 _nextPossibleAmt)
    {
        Offer memory offer = offers[_nftContract][_nftId];
        Bid memory existingBid = bids[_nftContract][_nftId];

        if (existingBid.amount == 0) {
            // No Bid
            return offer.startPrice;
        }
        return existingBid.amount;
    }

    function getFinalBuyPrice(IZenERC20 _nftContract, uint256 _nftId)
        external
        view
        returns (
            uint256 amountToSeller,
            uint256 amountFromBuyer,
            uint256 serviceFee,
            uint256 royaltyFee
        )
    {
        uint256 buyPrice = offers[_nftContract][_nftId].instantBuyPrice;

        serviceFee = (buyPrice * PROTOCOL_BUYING_FEE) / 10000;
        royaltyFee = (buyPrice * ROYALTY_FEE) / 10000;

        amountToSeller = buyPrice - royaltyFee - serviceFee;
        return (amountToSeller, buyPrice, serviceFee, royaltyFee);
    }

    function getAllContracts() public view returns (address[] memory) {
        uint256 l = whitelist.length;
        address[] memory contracts = new address[](l);

        for (uint256 i = 0; i < l; i++) {
            contracts[i] = address(whitelist[i]);
        }
        return contracts;
    }

    function getIds(IZenERC20 _nftContract)
        public
        view
        returns (uint256[] memory ids)
    {
        ids = contractToIds[_nftContract];
        return ids;
    }

    /* --------- BIDS --------- */
    function getBidsCountForAccount(address _account)
        public
        view
        returns (uint256 count)
    {
        uint256 whiteL = whitelist.length;
        uint256 l;
        uint256 id;
        Bid memory bid;
        for (uint256 c = 0; c < whiteL; c++) {
            IZenERC20 contr = whitelist[c];
            l = contractToIds[contr].length;
            for (uint256 i = 0; i < l; i++) {
                id = contractToIds[contr][i];
                bid = bids[contr][id];
                if (bid.bidder == _account) {
                    count++;
                }
            }
        }

        return count;
    }

    function getBidsForAccount(address _account, uint256 _count)
        public
        view
        returns (
            address[] memory contracts,
            uint256[] memory ids,
            uint256[] memory amounts,
            uint256[] memory madeBlocks
        )
    {
        if (_count == 0) {
            _count = getBidsCountForAccount(_account);
        }

        contracts = new address[](_count);
        ids = new uint256[](_count);
        amounts = new uint256[](_count);
        madeBlocks = new uint256[](_count);

        if (_count == 0) {
            return (contracts, ids, amounts, madeBlocks);
        }

        uint256 whiteL = whitelist.length;
        uint256 l;
        uint256 id;
        Bid memory bid;
        uint256 foundCount;
        for (uint256 c = 0; c < whiteL; c++) {
            IZenERC20 contr = whitelist[c];
            l = contractToIds[contr].length;
            for (uint256 i = 0; i < l; i++) {
                id = contractToIds[contr][i];
                bid = bids[contr][id];
                if (bid.bidder == _account) {
                    contracts[foundCount] = address(contr);
                    ids[foundCount] = id;
                    amounts[foundCount] = bid.amount;
                    madeBlocks[foundCount] = bid.madeBlock;
                    foundCount++;
                }
            }
        }

        return (contracts, ids, amounts, madeBlocks);
    }

    /* --------- OFFERS --------- */
    function getOffersCount() public view returns (uint256 count) {
        uint256 l = whitelist.length;

        for (uint256 i = 0; i < l; i++) {
            count += contractToIds[whitelist[i]].length;
        }

        return count;
    }

    function getOffers(
        uint256 start,
        uint256 count,
        uint256 sortBy,
        bool highToLow
    )
        public
        view
        returns (
            address[] memory contracts,
            uint256[] memory ids,
            uint256 totalCount
        )
    {
        // Always with full length. If filters are passed --> replaces the first X items and overrides the "l" --> everything after l is ignored
        IZenERC20[] memory contractList = whitelist;
        uint256 totalL;
        uint256 l = whitelist.length;

        for (uint256 i = 0; i < l; i++) {
            totalL += contractToIds[contractList[i]].length;
        }

        if (start == 0 && count == 0) {
            // Client wants all.
            count = totalL;
        } else {
            require(start < totalL, 'No items');
        }

        OfferPreview[] memory preview = getOfferPreview(
            totalL,
            l,
            contractList
        );

        {
            // Sorts by mutating the preview[]
            if (sortBy == 1) {
                quickSortBlock(preview);
            } else if (sortBy == 2) {
                quickSortBid(preview);
            } else if (sortBy == 3) {
                quickSortBuyPrice(preview);
            } else if (sortBy == 4) {
                quickSortRarity(preview);
            }
        }

        uint256 returnL = count;
        uint256 end = start + count;
        if (end > totalL) {
            end = totalL;
            returnL = totalL - start;
        }

        return getResult(start, end, totalL, returnL, preview, highToLow);
    }

    function getOffersWithFilter(
        address[] calldata _nftContracts,
        uint256 start,
        uint256 count,
        uint256 sortBy,
        bool highToLow
    )
        public
        view
        returns (
            address[] memory contracts,
            uint256[] memory ids,
            uint256 totalCount
        )
    {
        // Always with full length. If filters are passed --> replaces the first X items and overrides the "l" --> everything after l is ignored
        uint256 totalL;
        uint256 l = _nftContracts.length;
        IZenERC20[] memory contractList = new IZenERC20[](l);

        for (uint256 i = 0; i < l; i++) {
            contractList[i] = IZenERC20(_nftContracts[i]);
        }

        for (uint256 i = 0; i < l; i++) {
            totalL += contractToIds[contractList[i]].length;
        }

        if (start == 0 && count == 0) {
            // Client wants all.
            count = totalL;
        } else {
            require(start < totalL, 'No items');
        }

        OfferPreview[] memory preview = getOfferPreview(
            totalL,
            l,
            contractList
        );

        {
            // Sorts by mutating the preview[]
            if (sortBy == 1) {
                quickSortBlock(preview);
            } else if (sortBy == 2) {
                quickSortBid(preview);
            } else if (sortBy == 3) {
                quickSortBuyPrice(preview);
            } else if (sortBy == 4) {
                quickSortRarity(preview);
            }
        }

        uint256 returnL = count;
        uint256 end = start + count;
        if (end > totalL) {
            end = totalL;
            returnL = totalL - start;
        }

        return getResult(start, end, totalL, returnL, preview, highToLow);
    }

    function getOfferPreview(
        uint256 totalL,
        uint256 l,
        IZenERC20[] memory contractList
    ) internal view returns (OfferPreview[] memory) {
        OfferPreview[] memory preview = new OfferPreview[](totalL);

        uint256 currL;
        for (uint256 i = 0; i < l; i++) {
            IZenERC20 contr = contractList[i];
            uint256 idL = contractToIds[contr].length;
            for (uint256 j = 0; j < idL; j++) {
                uint256 nftId = contractToIds[contr][j];

                uint256 bidPrice = bids[contr][nftId].amount;
                if (bidPrice == 0) {
                    bidPrice = offers[contr][nftId].startPrice;
                }
                preview[currL] = OfferPreview({
                    nftId: nftId,
                    nftContract: contr,
                    madeBlock: offers[contr][nftId].madeBlock,
                    rarity: offers[contr][nftId].rarity,
                    instantBuyPrice: offers[contr][nftId].instantBuyPrice,
                    bidPrice: bidPrice
                });
                currL++;
            }
        }
        return preview;
    }

    function getResult(
        uint256 _start,
        uint256 _end,
        uint256 _totalL,
        uint256 _returnL,
        OfferPreview[] memory _preview,
        bool _highToLow
    )
        internal
        view
        returns (
            address[] memory contracts,
            uint256[] memory ids,
            uint256 totalCount
        )
    {
        address[] memory addresses = new address[](_returnL);
        uint256[] memory ids = new uint256[](_returnL);
        uint256 cl;
        if (_highToLow) {
            uint256 index;
            for (uint256 i = _start; i < _end; i++) {
                index = _totalL - i - 1;
                addresses[cl] = address(_preview[index].nftContract);
                ids[cl] = _preview[index].nftId;
                cl++;
            }
        } else {
            for (uint256 i = _start; i < _end; i++) {
                addresses[cl] = address(_preview[i].nftContract);
                ids[cl] = _preview[i].nftId;
                cl++;
            }
        }

        return (addresses, ids, _totalL);
    }

    /********
     * SORT *
     ********/

    function quickSortBlock(OfferPreview[] memory preview) internal pure {
        if (preview.length > 1) {
            quickByBlock(preview, 0, preview.length - 1);
        }
    }

    function quickSortBid(OfferPreview[] memory preview) internal pure {
        if (preview.length > 1) {
            quickByBid(preview, 0, preview.length - 1);
        }
    }

    function quickSortBuyPrice(OfferPreview[] memory preview) internal pure {
        if (preview.length > 1) {
            quickByBuyPrice(preview, 0, preview.length - 1);
        }
    }

    function quickSortRarity(OfferPreview[] memory preview) internal pure {
        if (preview.length > 1) {
            quickByRarity(preview, 0, preview.length - 1);
        }
    }

    function quickByBlock(
        OfferPreview[] memory preview,
        uint256 _low,
        uint256 _high
    ) internal pure {
        if (_low < _high) {
            uint256 pivotVal = preview[(_low + _high) / 2].madeBlock;

            uint256 low1 = _low;
            uint256 high1 = _high;
            for (;;) {
                while (preview[low1].madeBlock < pivotVal) low1++;
                while (preview[high1].madeBlock > pivotVal) high1--;
                if (low1 >= high1) {
                    break;
                }
                (preview[low1], preview[high1]) = (
                    preview[high1],
                    preview[low1]
                );
                low1++;
                high1--;
            }
            if (_low < high1) {
                quickByBlock(preview, _low, high1);
            }
            high1++;
            if (high1 < _high) {
                quickByBlock(preview, high1, _high);
            }
        }
    }

    function quickByBid(
        OfferPreview[] memory preview,
        uint256 _low,
        uint256 _high
    ) internal pure {
        if (_low < _high) {
            uint256 pivotVal = preview[(_low + _high) / 2].bidPrice;

            uint256 low1 = _low;
            uint256 high1 = _high;
            for (;;) {
                while (preview[low1].bidPrice < pivotVal) low1++;
                while (preview[high1].bidPrice > pivotVal) high1--;
                if (low1 >= high1) {
                    break;
                }
                (preview[low1], preview[high1]) = (
                    preview[high1],
                    preview[low1]
                );
                low1++;
                high1--;
            }
            if (_low < high1) {
                quickByBid(preview, _low, high1);
            }
            high1++;
            if (high1 < _high) {
                quickByBid(preview, high1, _high);
            }
        }
    }

    function quickByBuyPrice(
        OfferPreview[] memory preview,
        uint256 _low,
        uint256 _high
    ) internal pure {
        if (_low < _high) {
            uint256 pivotVal = preview[(_low + _high) / 2].instantBuyPrice;

            uint256 low1 = _low;
            uint256 high1 = _high;
            for (;;) {
                while (preview[low1].instantBuyPrice < pivotVal) low1++;
                while (preview[high1].instantBuyPrice > pivotVal) high1--;
                if (low1 >= high1) {
                    break;
                }
                (preview[low1], preview[high1]) = (
                    preview[high1],
                    preview[low1]
                );
                low1++;
                high1--;
            }
            if (_low < high1) {
                quickByBuyPrice(preview, _low, high1);
            }
            high1++;
            if (high1 < _high) {
                quickByBuyPrice(preview, high1, _high);
            }
        }
    }

    function quickByRarity(
        OfferPreview[] memory preview,
        uint256 _low,
        uint256 _high
    ) internal pure {
        if (_low < _high) {
            uint256 pivotVal = preview[(_low + _high) / 2].rarity;

            uint256 low1 = _low;
            uint256 high1 = _high;
            for (;;) {
                while (preview[low1].rarity < pivotVal) low1++;
                while (preview[high1].rarity > pivotVal) high1--;
                if (low1 >= high1) {
                    break;
                }
                (preview[low1], preview[high1]) = (
                    preview[high1],
                    preview[low1]
                );
                low1++;
                high1--;
            }
            if (_low < high1) {
                quickByRarity(preview, _low, high1);
            }
            high1++;
            if (high1 < _high) {
                quickByRarity(preview, high1, _high);
            }
        }
    }

    /*******************************
     * Authorized Setter Functions *
     *******************************/

    function setProtocolValues(
        uint256 _listingFee,
        uint256 _buyingFee,
        uint256 _floor,
        uint256 _royalty
    ) external onlyOwner {
        PROTOCOL_LISTING_FEE = _listingFee;
        PROTOCOL_BUYING_FEE = _buyingFee;
        MIN_PRICE = _floor;
        ROYALTY_FEE = _royalty;
    }

    function addToWhitelist(IZenERC20 _nftContract) external onlyOwner {
        require(inWhitelist(_nftContract) == false, 'Already in whitelist');
        uint256 l = whitelist.length;
        bool replaced = false;
        for (uint256 i = 0; i < l; i++) {
            if (address(whitelist[i]) == address(0)) {
                whitelist[i] = _nftContract;
                replaced = true;
            }
        }
        if (!replaced) {
            whitelist.push(_nftContract);
        }
    }

    function removeFromWhite(IZenERC20 _nftContract)
        external
        onlyOwner
        onlyWhitelisted(_nftContract)
    {
        uint256 l = whitelist.length;
        for (uint256 i = 0; i < l; i++) {
            if (address(whitelist[l]) == address(_nftContract)) {
                delete whitelist[l];
            }
        }
    }

    function setHelperAddress(address _helperAddr) external onlyOwner {
        require(_helperAddr != address(0), 'Zero Addr');
        Helper = IHelper(_helperAddr);
    }

    function setCd(uint256 _bidCd, uint256 _maxOBlocks) external onlyOwner {
        BID_WITHDRAW_CD = _bidCd;
        MAX_OFFER_BLOCKS = _maxOBlocks;
    }

    // When v2 is released
    function massBidRefund() external onlyOwner {
        uint256 l = whitelist.length;

        for (uint256 i = 0; i < l; i++) {
            uint256 idsL = contractToIds[whitelist[i]].length;
            for (uint256 j = 0; j < idsL; j++) {
                refundBidder(whitelist[i], contractToIds[whitelist[i]][j]);
            }
        }
    }

    // In case massBidRefund reverts for some reason
    function tryMassRefund() external onlyOwner {
        try this.massBidRefund() {} catch {
            payable(owner()).transfer(address(this).balance);
        }
    }

    // Deal with ETH
    fallback() external payable {}

    receive() external payable {}
}
