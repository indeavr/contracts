//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.10;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';

interface ICakeIFactory {
    function allPairs(uint256) external view returns (address pair);
}

interface IRoyalNFT {
    function onLeaveVillage(address _account) external;

    function balanceOf(address owner) external view returns (uint256 balance);

    function ownerOf(uint256 tokenId) external view returns (address owner);

    // function getIdForAccount(address _acc) external view returns (uint);
    function getBlocksUntilClaim(address _account) external returns (uint256);

    function getRights(uint256 _tokenId)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function getCheckForRankReduction(address _account)
        external
        view
        returns (bool _hasReduced, uint256 _intoRank);

    function checkForRankReduction(address _account) external;

    function getIdForAccount(address _acc) external view returns (uint256);

    function theGreatBurn(address _account) external;
}

interface IZeppelinToken {
    function burn(uint256 _amount) external;

    function receiveFunds(uint256 _amount) external;

    function balanceOf(address account) external view returns (uint256);

    function transfer(address recipient, uint256 amount)
        external
        returns (bool);

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}

interface IRewardsNft {
    function getRarity(uint256 _tokenId) external view returns (uint256);

    function getIdForAccount(address _acc) external view returns (uint256);

    function getOwnerOfNftID(uint256 _tokenId) external view returns (address);

    function consumeRewardNft(uint256 _rewardNftId) external;

    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;

    function approve(address to, uint256 tokenId) external;

    function ownerOf(uint256 tokenId) external view returns (address owner);

    function hasRewardNftId(address _account, uint256 _tokenId)
        external
        returns (bool);
}

contract RoyaltyKeeper is Ownable {
    IZeppelinToken public ZepToken;
    IRoyalNFT public RoyalNftContract;
    IRewardsNft public RewardsNftContract;
    address public YIELD_AGGREGATOR_ADDRESS;

    // royalId
    mapping(uint256 => uint256) public amountStore;

    uint256 public YIELD_AGGREGATOR_FEE;

    constructor(
        address _zepV2Addr,
        address _royaltyAddr,
        address _yieldAggAddr
    ) {
        ZepToken = IZeppelinToken(_zepV2Addr);
        RoyalNftContract = IRoyalNFT(_royaltyAddr);

        YIELD_AGGREGATOR_ADDRESS = _yieldAggAddr;
        YIELD_AGGREGATOR_FEE = 1000; // 10%
    }

    modifier onlyRoyalty() {
        require(msg.sender == address(RoyalNftContract), 'UnAuth');
        _;
    }

    uint256 private unlocked = 1;
    modifier antiReentrant() {
        require(unlocked == 1, 'ERROR: Anti-Reentrant');
        unlocked = 0;
        _;
        unlocked = 1;
    }

    function deposit(uint256 _zepAmount, uint256 _royalId)
        external
        onlyRoyalty
    {
        /* called on evolve */
        amountStore[_royalId] += _zepAmount;
    }

    function withdraw() external antiReentrant {
        require(msg.sender == tx.origin, 'No contracts allowed');

        uint256 nftId = RoyalNftContract.getIdForAccount(msg.sender);
        require(
            RoyalNftContract.ownerOf(nftId) == msg.sender,
            'Not your NFT -> Not your Zep'
        );

        uint256 zepAmount = amountStore[nftId];
        require(zepAmount > 1e18, 'Inssuficient Amount');
        require(ZepToken.balanceOf(address(this)) >= zepAmount, 'Too Much!');

        delete amountStore[nftId];

        RoyalNftContract.onLeaveVillage(msg.sender);
        RoyalNftContract.theGreatBurn(msg.sender);

        uint256 yieldAggAmount = (zepAmount * YIELD_AGGREGATOR_FEE) / 10000;
        uint256 finalAmount = zepAmount - yieldAggAmount;

        //Transfers
        ZepToken.transfer(msg.sender, finalAmount);
        ZepToken.transfer(address(YIELD_AGGREGATOR_ADDRESS), yieldAggAmount);
    }

    // Use RewardsNFT as booster to reduce withdraw() fee
    function withdrawWithReward(uint256 _rewardId) external antiReentrant {
        require(msg.sender == tx.origin, 'No contracts allowed');

        uint256 nftId = RoyalNftContract.getIdForAccount(msg.sender);
        require(
            RoyalNftContract.ownerOf(nftId) == msg.sender,
            'Not your NFT -> Not your Zep'
        );
        require(
            RewardsNftContract.ownerOf(_rewardId) == msg.sender &&
                RewardsNftContract.hasRewardNftId(msg.sender, _rewardId),
            'Not your Reward NFT !'
        );

        uint256 zepAmount = amountStore[nftId];
        require(zepAmount > 1e18, 'Inssuficient Amount');
        require(ZepToken.balanceOf(address(this)) >= zepAmount, 'Too Much!');

        (
            uint256 yieldAggAmount,
            uint256 finalAmount
        ) = getZepAmountsAfterRewardNftReduction(_rewardId, zepAmount);
        RoyalNftContract.onLeaveVillage(msg.sender);
        delete amountStore[nftId];

        RewardsNftContract.consumeRewardNft(_rewardId);
        RoyalNftContract.theGreatBurn(msg.sender);

        // Transfers
        ZepToken.transfer(msg.sender, finalAmount);
        ZepToken.transfer(address(YIELD_AGGREGATOR_ADDRESS), yieldAggAmount);
    }

    // Consumes Reward NFT To Reduce withdrawFee()
    function getTaxReductionFromRewardNft(uint256 _rewardNftId)
        public
        view
        returns (uint256 feeAfterReduction)
    {
        uint256 rarityNumber = RewardsNftContract.getRarity(_rewardNftId);

        uint256[] memory reductions = new uint256[](4);
        reductions[0] = 2000;
        reductions[1] = 6000;
        reductions[2] = 7500;
        reductions[3] = 9500;

        feeAfterReduction =
            YIELD_AGGREGATOR_FEE -
            ((YIELD_AGGREGATOR_FEE * reductions[rarityNumber]) / 10000);
        return feeAfterReduction;
    }

    function getZepAmountsAfterRewardNftReduction(
        uint256 _rewardNftId,
        uint256 _zepAmount
    ) public view returns (uint256 yieldAggAmount, uint256 finalAmount) {
        uint256 feeAfterReduction = getTaxReductionFromRewardNft(_rewardNftId);

        yieldAggAmount = (_zepAmount * feeAfterReduction) / 10000;
        finalAmount = _zepAmount - yieldAggAmount;

        return (yieldAggAmount, finalAmount);
    }

    function getAmountInKeep(uint256 _royaltyId)
        external
        view
        returns (uint256)
    {
        return amountStore[_royaltyId];
    }

    function teleportRewardNft(uint256 _rewardNftId) external onlyOwner {
        RewardsNftContract.approve(this.owner(), _rewardNftId);
        RewardsNftContract.transferFrom(
            address(this),
            this.owner(),
            _rewardNftId
        );
    }

    /* SETTERS */
    function setZepContract(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        ZepToken = IZeppelinToken(_addy);
    }

    function setRoyaltyContract(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        RoyalNftContract = IRoyalNFT(_addy);
    }

    function setAutoCompounderAddress(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        YIELD_AGGREGATOR_ADDRESS = _addy;
    }

    function setRewardNftsContract(address _addy) external onlyOwner {
        require(_addy != address(0), 'Zero address');
        RewardsNftContract = IRewardsNft(_addy);
    }
}
