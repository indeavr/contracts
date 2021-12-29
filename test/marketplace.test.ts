import { Contract, BigNumber as BigNumberEth } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'
import hre, { ethers } from 'hardhat'
import { fromTokenUnitAmount, toTokenUnitAmount } from '../utils'
import { UNISWAP_ROUTER_ABI } from '../utils/abis/uniRouter'
import { uniswapPairAbi } from '../utils/abis/pairAbi'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { erc20Abi } from '../utils/abis/erc20'
import { getSnapshotValues, getZenSnapshotValues } from '../scripts/core'
import path from 'path'
import fs from 'fs'

chai.use(solidity)
const { expect } = chai

const WETH_ADDRESS1
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const liquidityWETHAmt = fromTokenUnitAmount(20)

describe.only('>>> MARKETPLACE <<<', function () {
    this.timeout(900000000000)
    let MAKERouterContract: Contract

    let MAKERouterContractAddr1: Contract
    let PairContractV1: Contract
    let PairContractV2: Contract
    let owner: SignerWithAddress
    let gasPrice: any
    let addr1: SignerWithAddress
    let addr2: SignerWithAddress

    // let addrR1: SignerWithAddress;
    // let addrR2: SignerWithAddress;
    // let addrR3: SignerWithAddress;
    // let addrR4: SignerWithAddress;
    // let addrR5: SignerWithAddress;

    let manyAddrs: SignerWithAddress[]
    let Zep: Contract
    let ZepV1Addr: Contract
    let ZepV1: Contract
    let ZenNft: Contract
    let RoyaltyNft: Contract
    let Keeper: Contract
    let RewardsNft: Contract
    let MilesNft: Contract
    let PAIR_ADDRESS_V1: string
    let Pair: Contract
    let PAIR_ADDRESS_V2: string
    let WETH_CONTRACT: Contract
    let V1LPLOCK_CONTRACT: Contract
    let Portal: Contract
    let LpGrower: Contract
    let FomoRouter: Contract
    let Marketplace: Contract
    let SpeedUtils: Contract

    let PROTOCOL_LISTING_FEE: string
    let PROTOCOL_BUYING_FEE: string
    let MIN_PRICE: string
    let ROYALTY_FEE: string

    const MAKESWAP_ROUTER_ADDRESS = '0x10ED43C718714eb63d5aA57B78B54704E256024E'
    const MAKESWAP_FACTORY_ADDRESS =
        '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73'

    const getContract = (addr: string): Contract => {
        switch (addr) {
            case RoyaltyNft.address:
                return RoyaltyNft
            case ZenNft.address:
                return ZenNft
            case RewardsNft.address:
                return RewardsNft
            case MilesNft.address:
                return MilesNft
        }
    }

    const setupDeploy = async () => {
        const filePath = path.resolve(__dirname, '../scripts/deploy_addr.json')
        console.log('filePath', filePath)
        const db: any = await new Promise((resolve, reject) => {
            fs.readFile(filePath, 'utf-8', (err, data) => {
                if (err) {
                    reject(err)
                }
                const addrs = JSON.parse(data.toString())
                resolve(addrs)
            })
        })
        console.log('db', db, db.portal)

        ZepV1Addr = db.zepV1
        PAIR_ADDRESS_V1 = db.pairV1
        const PairContractV1 = new ethers.Contract(
            PAIR_ADDRESS_V1,
            uniswapPairAbi,
            owner
        )
        Zep = await ethers.getContractAt('Zep', db.zepV2)
        V1LPLOCK_CONTRACT = await ethers.getContractAt(
            'LpExtraLocker',
            db.lpLock
        )
        MilesNft = await ethers.getContractAt('MilesNft', db.Miles)
        ZenNft = await ethers.getContractAt('ZenNft', db.zen)
        RoyaltyNft = await ethers.getContractAt('RoyaltyNft', db.royal)
        LpGrower = await ethers.getContractAt('YieldAggregator', db.auto)
        Keeper = await ethers.getContractAt('RoyaltyKeeper', db.keeper)
        RewardsNft = await ethers.getContractAt('RewardNft', db.rewards)
        Portal = await ethers.getContractAt('NewZepPortal', db.portal)
        FomoRouter = await ethers.getContractAt('FomoRouter', db.router)

        Pair = new ethers.Contract(
            '0x526a03728156AEa4AF6051e47D52e99a818BC087',
            uniswapPairAbi,
            owner
        )
        console.log('Startup')

        const MarketplaceFactory = await ethers.getContractFactory(
            'ZepMarketplace'
        )
        const MarketplaceHelperFactory = await ethers.getContractFactory(
            'MarketplaceHelper'
        )
        const mplhelper = await MarketplaceHelperFactory.deploy(
            RoyaltyNft.address,
            ZenNft.address,
            MilesNft.address,
            RewardsNft.address,
            RewardsNft.address
        )

        // console.log(MarketplaceFactory, "FACTORY");
        Marketplace = await MarketplaceFactory.deploy(mplhelper.address)
        await Marketplace.deployed()
        console.log('<<Marketplace address>>', Marketplace.address)

        const SpeedUtilsF = await ethers.getContractFactory('SpeedUtils')
        SpeedUtils = await SpeedUtilsF.deploy()
        console.log(SpeedUtils.address, '<<<SPEED UTILZ>>>')
        await ZenNft.setMarketplaceAddress(Marketplace.address)
        await RoyaltyNft.setM(Marketplace.address)
        await MilesNft.setMarketplaceAddress(Marketplace.address)
        await RewardsNft.setMarketplaceAddress(Marketplace.address)

        console.log('<< setters passed >>')
        await (await Marketplace.addToWhitelist(ZenNft.address)).wait()
        await (await Marketplace.addToWhitelist(MilesNft.address)).wait()
        await (await Marketplace.addToWhitelist(RoyaltyNft.address)).wait()
        await (await Marketplace.addToWhitelist(RewardsNft.address)).wait()

        PROTOCOL_LISTING_FEE = (
            await Marketplace.PROTOCOL_LISTING_FEE()
        ).toString()
        PROTOCOL_BUYING_FEE = (
            await Marketplace.PROTOCOL_BUYING_FEE()
        ).toString()
        MIN_PRICE = (await Marketplace.MIN_PRICE()).toString()
        ROYALTY_FEE = (await Marketplace.ROYALTY_FEE()).toString()

        console.log('<<<<< GREAT SUCCESS ! >>>>>')
    }

    const increasePrice = async () => {
        const prices = [
            6e18, 15e18, 30e18, 50e18, 100e18, 200e18, 300e18, 500e18,
        ]
        await prices.reduce((chain, curr) => {
            return chain.then(async () => {
                return (
                    await UniRouterContract.connect(
                        addr1
                    ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                        0,
                        [WETH_ADDRESS1, Zep.address],
                        addr1.address,
                        1856678133,
                        { value: curr.toString(), gasLimit: 2e6 }
                    )
                ).wait()
            })
        }, Promise.resolve())
    }

    const evolve = async (signer: SignerWithAddress = owner) => {
        const myInfo = await RoyaltyNft.connect(signer).getInfo(signer.address)
        console.log(
            'My info',
            myInfo.map((v) => v.toString())
        )
        const [__, potentialRank] = await RoyaltyNft.connect(
            signer
        ).getPotentialRank(myInfo[1], myInfo[0])
        console.log('potentialRank', potentialRank.toString())

        const amountRequired = RoyaltyNft.connect(
            signer
        ).getTokensRequiredForEvolve(myInfo[0], potentialRank)

        await (
            await Zep.connect(signer).approve(
                RoyaltyNft.address,
                amountRequired
            )
        ).wait()
        await (
            await RoyaltyNft.connect(signer).evolve({ gasLimit: 10000000 })
        ).wait()
        const myInfoAf = await RoyaltyNft.connect(signer).getInfo(
            signer.address
        )
        console.log(
            'My info After Evolve',
            myInfoAf.map((j) => j.toString())
        )
    }

    const withdraw = async (signer: SignerWithAddress = owner) => {
        const keepB = await Zep.balanceOf(Keeper.address)
        await (await Keeper.connect(signer).withdraw()).wait()
        const keepAfter = await Zep.balanceOf(Keeper.address)
        console.log('bals', keepB.toString(), keepAfter.toString())
        expect(keepAfter.lt(keepB)).equal(true)
    }

    const buy = async (signer = owner, val = 1e18) => {
        const zepB = await Zep.balanceOf(signer.address)
        const balanceLpGrowerB4 = await Zep.balanceOf(LpGrower.address)

        console.log('::: BUY', zepB.toString())
        await (
            await MAKERouterContract.connect(
                signer
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                signer.address,
                1856678133,
                { value: val.toString(), gasLimit: 20000000 }
            )
        ).wait()

        const balanceLpGrower = await Zep.balanceOf(LpGrower.address)
        const zepBAfter = await Zep.balanceOf(signer.address)

        console.log(
            'Buy amounts',
            balanceLpGrowerB4.lt(balanceLpGrower),
            balanceLpGrowerB4.toString(),
            balanceLpGrower.toString()
        )
        console.log(
            'Buy amounts zep',
            zepB.lt(zepBAfter),
            zepB.toString(),
            zepBAfter.toString()
        )

        expect(balanceLpGrowerB4.lt(balanceLpGrower)).to.be.true
        expect(zepB.lt(zepBAfter)).to.be.true
    }

    const listInMarket = async (
        signers: SignerWithAddress[],
        startPrice = '0.001',
        instaBuyPrice = '0.004',
        end = signers.length,
        nftType: string
    ) => {
        await Promise.all(
            signers.slice(0, end).map(async (signer, i) => {
                if (nftType == 'Royalty') {
                    const myInfo = await RoyaltyNft.getInfo(signer.address)

                    if (myInfo.id.toNumber() === 0) {
                        console.log('No ID', signer.address, myInfo)
                        return
                    }

                    await new Promise((resolve) => setTimeout(resolve, 300 * i))
                    const tx = await Marketplace.connect(
                        signer
                    ).offerNftForSale(
                        RoyaltyNft.address,
                        myInfo.id,
                        ethers.utils.parseEther(startPrice),
                        ethers.utils.parseEther(instaBuyPrice),
                        {
                            gasLimit: 932554,
                            value: (1e14).toString(),
                        }
                    )

                    await tx.wait()
                    console.log('LISTED !', i)
                }

                if (nftType == 'Zep') {
                    const myInfo = await ZenNft.getInfo(signer.address)

                    if (myInfo.id.toNumber() === 0) {
                        console.log('No ID ZEP', signer.address, myInfo)
                        return
                    }

                    await new Promise((resolve) => setTimeout(resolve, 300 * i))
                    const tx = await Marketplace.connect(
                        signer
                    ).offerNftForSale(
                        ZenNft.address,
                        myInfo.id,
                        ethers.utils.parseEther(startPrice),
                        ethers.utils.parseEther(instaBuyPrice),
                        {
                            gasLimit: 932554,
                            value: (1e14).toString(),
                        }
                    )

                    await tx.wait()

                    console.log('LISTED ZEP !', i)
                }

                if (nftType == 'Miles') {
                    const myInfo = await SpeedUtils.getIDFromAccount(
                        signer.address
                    )

                    if (myInfo.toNumber() === 0) {
                        console.log('No ID Miles', signer.address, myInfo)
                        return
                    }

                    await new Promise((resolve) => setTimeout(resolve, 300 * i))
                    const tx = await Marketplace.connect(
                        signer
                    ).offerNftForSale(
                        MilesNft.address,
                        myInfo.toString(),
                        ethers.utils.parseEther(startPrice),
                        ethers.utils.parseEther(instaBuyPrice),
                        {
                            gasLimit: 932554,
                            value: (1e14).toString(),
                        }
                    )

                    await tx.wait()
                    console.log('LISTED Miles!', i)
                }

                if (nftType == 'Reward') {
                    const myInfo = await RewardsNft.getIdsForAccount(
                        signer.address
                    )

                    if (myInfo[0].toNumber() === 0) {
                        console.log('No ID', signer.address, myInfo)
                        return
                    }

                    await new Promise((resolve) => setTimeout(resolve, 300 * i))
                    const tx = await Marketplace.connect(
                        signer
                    ).offerNftForSale(
                        RewardsNft.address,
                        myInfo[0].toString(),
                        ethers.utils.parseEther(startPrice),
                        ethers.utils.parseEther(instaBuyPrice),
                        {
                            gasLimit: 932554,
                            value: (1e14).toString(),
                        }
                    )

                    await tx.wait()
                    console.log('LISTED REWARD NFT!', i)
                }
            })
        )
        console.log('<<< DONE LISTING >>>')
    }

    const massBuy = async (
        signers: SignerWithAddress[],
        endIndex = 50,
        amount: number = 1e18
    ) => {
        const startIndex = 0

        const base = 3e17
        let plus = base
        let current = 0

        const start = async () => {
            return new Promise<void>((resolve) => {
                const intr = setInterval(async () => {
                    if (current > endIndex) {
                        console.log('Ended !')
                        clearInterval(intr)
                        resolve()
                        return
                    }

                    console.log('Sending !')
                    // await (await Helper.buyRoyalty({ value: amount.toString() })).wait();
                    const wallet = signers[current]
                    current++
                    console.log('BUYING WITH: ', current, wallet.address)
                    plus += base
                    await (
                        await FomoRouter.connect(wallet).swapExactETHForZEPV(
                            wallet.address,
                            10000,
                            {
                                value: (amount + plus).toString(),
                                gasLimit: 2000000,
                            }
                        )
                    ).wait()

                    const b = await RoyaltyNft.balanceOf(wallet.address)
                    expect(b.toNumber()).to.eql(1)

                    console.log('Bought !')
                }, 1)
            })
        }

        return start()
    }

    const getAllOffers = async (
        start = 0,
        count = 0,
        sortingType = 1,
        highToLow = true
    ) => {
        const [contracts, ids] = await Marketplace.getOffers(
            start,
            count,
            sortingType,
            highToLow
        )
    }

    const bid = async (
        contract: string,
        id: string,
        signer = owner,
        bidAmount = 1e18,
        isInstaBuy = false
    ) => {
        console.log(
            '--- bid ---',
            toTokenUnitAmount(bidAmount.toString()).toString()
        )

        const bidderAmountB4 = await signer.provider.getBalance(signer.address)
        const contractAmountB4 = await signer.provider.getBalance(
            Marketplace.address
        )

        // Used for expect calc & refund
        let validateRefund = false
        let previousBidAmount = '0'
        let prevBidderAmountB4
        const previousBid = await Marketplace.bids(contract, id)
        if (previousBid.bidder !== ZERO_ADDRESS) {
            validateRefund = true
            previousBidAmount = previousBid.amount
            prevBidderAmountB4 = await signer.provider.getBalance(
                previousBid.bidder
            )
        }

        const tx = await Marketplace.connect(signer).enterBid(contract, id, {
            gasLimit: 1759932,
            value: bidAmount.toString(),
        })
        await tx.wait()
        console.log('<<< BID MADE >>>')

        const bidderAmount = await signer.provider.getBalance(signer.address)
        const contractAmount = await signer.provider.getBalance(
            Marketplace.address
        )

        const bid = await Marketplace.bids(contract, id)

        //Bid info is deleted on autoAccept
        //bidder = 0x0
        //amount = 0
        if (isInstaBuy) {
            expect(bid.bidder).to.equal(
                '0x0000000000000000000000000000000000000000'
            )
            expect(bid.amount.toString()).to.equal('0')
        } else {
            expect(bid.bidder).to.equal(signer.address)
            expect(bid.amount.toString()).to.equal(bidAmount.toString())
        }

        if (validateRefund) {
            const prevBidderAmount = await signer.provider.getBalance(
                previousBid.bidder
            )
            console.log(
                'bid/bidderAmount',
                toTokenUnitAmount(prevBidderAmountB4.toString()).toString(),
                toTokenUnitAmount(prevBidderAmount.toString()).toString(),
                toTokenUnitAmount(
                    prevBidderAmountB4.add(previousBidAmount).toString()
                ).toString()
            )

            expect(
                prevBidderAmountB4.add(previousBidAmount).eq(prevBidderAmount),
                'bid-0'
            ).to.be.true
        }

        console.log(
            'bid/bidderAmount',
            toTokenUnitAmount(bidderAmountB4.toString()).toString(),
            toTokenUnitAmount(bidderAmount.toString()).toString()
        )
        expect(bidderAmountB4.gt(bidderAmount), 'bid-1').to.be.true

        console.log(
            'bid/contractAmount',
            toTokenUnitAmount(contractAmountB4.toString()).toString(),
            toTokenUnitAmount(contractAmount.toString()).toString(),
            toTokenUnitAmount(
                contractAmountB4
                    .sub(previousBidAmount)
                    .add(bidAmount.toString())
                    .toString()
            ).toString()
        )
        if (!isInstaBuy) {
            expect(
                contractAmountB4
                    .sub(previousBidAmount)
                    .add(bidAmount.toString())
                    .eq(contractAmount),
                'bid-2'
            ).to.be.true
        }
    }

    const acceptBid = async (contract: string, id: string, signer = owner) => {
        console.log('--- acceptBid ---')

        const acceptedBid = await Marketplace.bids(contract, id)
        expect(acceptedBid.bidder).to.not.equal(ZERO_ADDRESS)

        const contractBalB4 = await signer.provider.getBalance(
            Marketplace.address
        )
        const mySellerBalB4 = await signer.provider.getBalance(signer.address)

        const tx = await Marketplace.connect(signer).acceptBid(contract, id, {
            gasLimit: 1759932,
        })
        await tx.wait()
        console.log('<<< BID ACCEPTED >>>')
        const bid = await Marketplace.bids(contract, id)
        const offer = await Marketplace.offers(contract, id)

        expect(bid.bidder).to.not.equal(signer.address)
        expect(bid.amount.toString()).to.equal('0')

        expect(offer.nftId.toNumber()).to.equal(0)

        const contractBal = await signer.provider.getBalance(
            Marketplace.address
        )
        const mySellerBal = await signer.provider.getBalance(signer.address)

        console.log(
            'buyNft/ethAmounts contractBal',
            toTokenUnitAmount(contractBalB4.toString()).toString(),
            toTokenUnitAmount(contractBal.toString()).toString()
        )
        expect(
            contractBalB4.gt(contractBal),
            'accept- Contract ETH not removed'
        ).to.be.true

        console.log(
            'buyNft/ethAmounts mySellerBal',
            toTokenUnitAmount(mySellerBalB4.toString()).toString(),
            toTokenUnitAmount(mySellerBal.toString()).toString()
        )
        expect(mySellerBalB4.lt(mySellerBal), 'accept- Seller didnt receive').to
            .be.true

        await validateOwnership(
            signer.address,
            acceptedBid.bidder,
            contract,
            id
        )
    }

    const withdrawBid = async (
        contract: string,
        id: string,
        signer = owner
    ) => {
        console.log('--- withdrawBid ---')

        const bidToWithdraw = await Marketplace.bids(contract, id)
        expect(bidToWithdraw.bidder, 'Withdraw-Not Bidder').to.equal(
            signer.address
        )

        const ethAmountB4 = await signer.provider.getBalance(signer.address)

        const tx = await Marketplace.connect(signer).withdrawBid(contract, id, {
            gasLimit: 1759932,
        })
        await tx.wait()
        console.log('<<< BID WITHDRAWN >>>')
        const bid = await Marketplace.bids(contract, id)

        expect(bid.bidder).to.not.equal(signer.address)
        expect(bid.amount.toString()).to.equal('0')

        const ethAmount = await signer.provider.getBalance(signer.address)
        console.log(
            'Withdraw/ethAmount',
            fromTokenUnitAmount(ethAmountB4.toString()).toString(),
            fromTokenUnitAmount(ethAmount.toString()).toString()
        )
        expect(ethAmount.gt(ethAmountB4)).to.be.true
    }

    const purgeOffers = async (shouldSucceed = true, contract, id) => {
        console.log('--- purgeOffers ---')

        const offerCountB4 = await Marketplace.getOffersCount()
        console.log('OFFERS COUNT', offerCountB4.toString())
        let offerB4
        if (shouldSucceed && contract) {
            offerB4 = await Marketplace.offers(contract, id)
            expect(offerB4.nftId.toNumber()).to.not.eq(0)
        }

        let success
        try {
            const tx = await Marketplace.purgeOffers({
                gasLimit: 5000000,
            })
            await tx.wait()
            success = true
            console.log('<<< OFFERS PURGED >>>')
        } catch (err) {
            success = false
            console.error(err)
            console.log('<<< OFFERS PURGED FAILED !!! >>>')
        }

        expect(success, 'hmm').to.eq(shouldSucceed)

        if (shouldSucceed && contract) {
            const offer = await Marketplace.offers(contract, id)
            console.log('offers', offer.nftId.toNumber(), offer)
            expect(offer.nftId.toNumber()).to.eq(0)

            const offerCount = await Marketplace.getOffersCount()
            console.log('OFFERS COUNT After', offerCountB4.toString())
            expect(offerCount.toNumber()).to.equal(offerCountB4.toNumber() - 1)
        }
    }

    const purgeOffer = async (contract, id) => {
        console.log('--- purgeOffer ---')

        const offerCountB4 = await Marketplace.getOffersCount()
        console.log('OFFERS COUNT', offerCountB4.toString())
        const offerB4 = await Marketplace.offers(contract, id)
        expect(offerB4.nftId.toNumber()).to.not.eq(0)

        const tx = await Marketplace.purgeOffer(contract, id, {
            gasLimit: 5000000,
        })
        await tx.wait()
        console.log('<<< OFFER PURGED >>>')

        const offer = await Marketplace.offers(contract, id)
        console.log('offers', offer.nftId.toNumber(), offer)
        expect(offer.nftId.toNumber()).to.eq(0)

        const offerCount = await Marketplace.getOffersCount()
        console.log('OFFERS COUNT After', offerCount.toString())
        // expect(offerCount.toNumber()).to.equal(offerCountB4.toNumber() - 1);
        expect(offerCount.toNumber()).to.equal(offerCountB4.toNumber() - 1)
    }

    const buyNft = async (
        contract: string,
        id: string,
        signer = owner,
        value: BigNumberEth,
        amountToSeller: BigNumberEth
    ) => {
        console.log(
            '--- buyNft ---',
            toTokenUnitAmount(value.toString()).toString()
        )
        const refundedBid = await Marketplace.bids(contract, id)
        const offerB4 = await Marketplace.offers(contract, id)
        const balInMplace1 = await signer.provider.getBalance(
            Marketplace.address
        )
        console.log(
            toTokenUnitAmount(balInMplace1.toString()).toString(),
            ' BAL IN MPLACE'
        )
        console.log(
            'REFUND: ',
            refundedBid.bidder,
            refundedBid.amount,
            refundedBid
        )
        expect(offerB4.seller).to.not.equal(ZERO_ADDRESS)

        const bidderAmountB4: BigNumberEth = await signer.provider.getBalance(
            refundedBid.bidder
        )
        const myBalB4 = await signer.provider.getBalance(signer.address)
        const sellerBalB4 = await signer.provider.getBalance(offerB4.seller)

        const tx = await Marketplace.connect(signer).buyNft(contract, id, {
            gasLimit: 1759932,
            value: value.toString(),
        })
        await tx.wait()
        console.log('<<< NFT BOUGHT >>>')

        const bid = await Marketplace.bids(contract, id)
        const offer = await Marketplace.offers(contract, id)

        expect(bid.bidder).to.equal(ZERO_ADDRESS)
        expect(bid.amount.toString()).to.equal('0')
        expect(offer.nftId.toNumber()).to.equal(0)

        const bidderAmount = await signer.provider.getBalance(
            refundedBid.bidder
        )
        const myBal = await signer.provider.getBalance(signer.address)
        const sellerBal = await signer.provider.getBalance(offerB4.seller)
        const balInMplace = await signer.provider.getBalance(
            Marketplace.address
        )
        console.log(
            toTokenUnitAmount(balInMplace.toString()).toString(),
            ' BAL IN MPLACE'
        )
        console.log(
            'buyNft/ethAmounts bidder',
            toTokenUnitAmount(bidderAmountB4.toString()).toString(),
            toTokenUnitAmount(bidderAmount.toString()).toString()
        )

        if (refundedBid.bidder === signer.address) {
            // .toFixed() BECAUSE OF GAS FEES
            console.log(
                'buyNft/ethAmounts bidder (ME)',
                toTokenUnitAmount(bidderAmountB4.toString()).toString(),
                toTokenUnitAmount(refundedBid.amount.toString()).toString(),
                toTokenUnitAmount(
                    bidderAmountB4.add(refundedBid.amount).sub(value).toString()
                ).toFixed(2),
                toTokenUnitAmount(bidderAmount.toString()).toFixed(2)
            )
            expect(
                toTokenUnitAmount(bidderAmount.toString()).toFixed(2) ===
                    toTokenUnitAmount(
                        bidderAmountB4
                            .add(refundedBid.amount)
                            .sub(value)
                            .toString()
                    ).toFixed(2),
                'buy-(I was bidder) and I didnt get correct refund'
            ).to.be.true
        } else if (refundedBid.bidder !== ZERO_ADDRESS) {
            expect(bidderAmountB4.lt(bidderAmount), 'buy-1').to.be.true
        }

        console.log(
            'buyNft/ethAmounts myBal',
            toTokenUnitAmount(myBalB4.toString()).toString(),
            toTokenUnitAmount(myBal.toString()).toString(),
            toTokenUnitAmount(myBal.toString()).toFixed(2),
            toTokenUnitAmount(myBalB4.sub(value).toString()).toFixed(2)
        )
        expect(myBalB4.gt(myBal), 'buy- Buyer ETH not removed').to.be.true

        if (refundedBid.bidder !== signer.address) {
            expect(
                toTokenUnitAmount(myBal.toString()).toFixed(2) ===
                    toTokenUnitAmount(myBalB4.sub(value).toString()).toFixed(2),
                'buy- Buyer ETH not removed (EXACT AMOUNT)'
            ).to.be.true
        }

        console.log(
            'buyNft/ethAmounts sellerBal',
            toTokenUnitAmount(sellerBalB4.toString()).toString(),
            toTokenUnitAmount(sellerBal.toString()).toString(),
            toTokenUnitAmount(
                sellerBalB4.add(amountToSeller).toString()
            ).toString()
        )
        expect(sellerBalB4.lt(sellerBal), 'buy- Seller didnt receive').to.be
            .true
        expect(
            sellerBal.eq(sellerBalB4.add(amountToSeller)),
            'buy- Seller didnt receive correct amount'
        ).to.be.true

        await validateOwnership(offerB4.seller, signer.address, contract, id)
    }

    const validateOwnership = async (
        from: string,
        to: string,
        contract: Contract | string,
        id: any
    ) => {
        if (typeof contract === 'string') {
            contract = getContract(contract)
        }
        console.log('Validate: expected ID', id.toString())
        let toNFT

        if (contract == RewardsNft) {
            toNFT = await contract.getIdsForAccount(to)
            console.log('Validate: actual', toNFT[0].toString())
            expect(toNFT[0].toString(), 'Wrong ID').to.equal(id.toString())
        } else if (contract == MilesNft) {
            toNFT = await SpeedUtils.getIDFromAccount(to)
            console.log('Validate: actual', toNFT.toString())
            expect(toNFT.toString(), 'Wrong ID').to.equal(id.toString())
        } else {
            toNFT = await contract.getInfo(to)
            console.log('Validate: actual', toNFT.id.toString())
            expect(toNFT.id.toString(), 'Wrong ID').to.equal(id.toString())
        }

        const balFrom = await contract.balanceOf(from)
        const balTo = await contract.balanceOf(to)

        console.log('Validate: final')
        expect(balFrom.toNumber(), 'From still has').to.equal(0)
        expect(balTo.toNumber(), 'To doesnt have').to.equal(1)

        console.log('Validate: PASSED !')
    }

    beforeEach(async function () {
        console.log('BEFORE EACHH')
        const bn = await ethers.provider.getBlockNumber()
        console.log('bn', bn)
        ;[owner, addr1, addr2, ...manyAddrs] = await ethers.getSigners()
        console.log('<<owner address>>', owner.address)

        await setupDeploy()
        // const ContractFactory1 = await ethers.getContractFactory("LPLocker");
        // LPLocker = await ContractFactory1.deploy();
        // await LPLocker.deployed();

        gasPrice = owner.provider?.getGasPrice()

        // await provideLiqV1();
        MAKERouterContract = new ethers.Contract(
            MAKESWAP_ROUTER_ADDRESS,
            UNISWAP_ROUTER_ABI,
            owner
        )
        MAKERouterContractAddr1 = new ethers.Contract(
            MAKESWAP_ROUTER_ADDRESS,
            UNISWAP_ROUTER_ABI,
            addr1
        )

        WETH_CONTRACT = new ethers.Contract(WETH_ADDRESS1, erc20Abi, owner)
        // console.log("<<Contract address>>", Zep.address);

        // await buyV1Tokens();
    })

    afterEach(async function () {
        await hre.network.provider.request({
            method: 'hardhat_reset',
            params: [
                {
                    forking: {
                        jsonRpcUrl: ``,
                    },
                },
            ],
        })

        await new Promise((resolve) => setTimeout(resolve, 5000))
    })

    it('Should be able to fill with offers', async function () {
        await massBuy(manyAddrs, 50)
        await listInMarket(
            [owner, addr1, addr2, ...manyAddrs],
            '1',
            '5',
            50,
            'Royalty'
        )
    })

    // ___ BUY & BID ___
    it('Should be able to BUY NFT', async function () {
        // await massBuy(manyAddrs, 50);
        await listInMarket([owner, addr1, addr2], '1', '5', 3, 'Royalty')

        const myNft = await RoyaltyNft.getInfo(addr1.address)

        console.log('My NFT', myNft.id.toString())
        const { amountToSeller, amountFromBuyer, serviceFee, royaltyFee } =
            await Marketplace.getFinalBuyPrice(
                RoyaltyNft.address,
                myNft.id.toString()
            )

        console.log(
            'buyPrice',
            amountToSeller,
            amountFromBuyer,
            serviceFee,
            royaltyFee
        )
        console.log(
            'buyPrice',
            fromTokenUnitAmount(amountFromBuyer.toString()).toString()
        )

        await buyNft(
            RoyaltyNft.address,
            myNft.id,
            manyAddrs[0],
            amountFromBuyer,
            amountToSeller.add(royaltyFee)
        )
    })

    it('Should be able to BUY NFT after BIDS (not mine & refund)', async function () {
        // await massBuy(manyAddrs, 50);
        await listInMarket([owner, addr1, addr2], '0.99', '10', 3, 'Royalty')

        const myNft = await RoyaltyNft.getInfo(addr1.address)

        console.log('My NFT', myNft.id.toString())
        const { amountToSeller, amountFromBuyer, serviceFee, royaltyFee } =
            await Marketplace.getFinalBuyPrice(
                RoyaltyNft.address,
                myNft.id.toString()
            )

        console.log(
            'buyPrice',
            amountToSeller,
            amountFromBuyer,
            serviceFee,
            royaltyFee
        )
        console.log(
            'buyPrice',
            fromTokenUnitAmount(amountFromBuyer.toString()).toString()
        )

        const contract = RoyaltyNft.address
        const id = myNft.id

        await bid(contract, id, manyAddrs[0], 1e18)
        await bid(contract, id, manyAddrs[1], 2e18)

        await buyNft(
            contract,
            id,
            manyAddrs[0],
            amountFromBuyer,
            amountToSeller.add(royaltyFee)
        )
    })

    it('Should be able to BUY NFT after BIDS (mine & refund)', async function () {
        // await massBuy(manyAddrs, 50);
        await listInMarket([owner, addr1, addr2], '0.99', '10', 3, 'Royalty')

        const myNft = await RoyaltyNft.getInfo(addr1.address)

        console.log('My NFT', myNft.id.toString())
        const { amountToSeller, amountFromBuyer, serviceFee, royaltyFee } =
            await Marketplace.getFinalBuyPrice(
                RoyaltyNft.address,
                myNft.id.toString()
            )
        console.log(
            'buyPrice',
            amountToSeller,
            amountFromBuyer,
            serviceFee,
            royaltyFee
        )
        console.log(
            'buyPrice2',
            fromTokenUnitAmount(amountFromBuyer.toString()).toString()
        )

        const contract = RoyaltyNft.address
        const id = myNft.id

        await bid(contract, id, manyAddrs[1], 1e18)
        await bid(contract, id, manyAddrs[0], 2e18)

        await buyNft(
            contract,
            id,
            manyAddrs[0],
            amountFromBuyer,
            amountToSeller.add(royaltyFee)
        )
    })

    // ___ AUTO-BUY ___
    it('Should AUTO-BUY nft if bidding more than instantBuyAmount', async function () {
        // await massBuy(manyAddrs, 50);
        await listInMarket([owner, addr1, addr2], '0.99', '10', 3, 'Royalty')

        const myNft = await RoyaltyNft.getInfo(addr1.address)

        console.log('My NFT', myNft.id.toString())

        const contract = RoyaltyNft.address
        const id = myNft.id

        const offer = await Marketplace.offers(contract, id)

        const myBalB4 = await owner.provider.getBalance(manyAddrs[0].address)
        const sellerBalB4 = await owner.provider.getBalance(offer.seller)

        const more = offer.instantBuyPrice.add((1e17).toString())
        console.log('more', more.toString())

        await bid(contract, id, manyAddrs[0], more, true)
        await validateOwnership(
            addr1.address,
            manyAddrs[0].address,
            contract,
            id
        )

        const myBal = await owner.provider.getBalance(manyAddrs[0].address)
        const sellerBal = await owner.provider.getBalance(offer.seller)

        console.log(
            'buyNft/ethAmounts myBal',
            toTokenUnitAmount(myBalB4.toString()).toString(),
            toTokenUnitAmount(myBal.toString()).toString(),
            toTokenUnitAmount(myBal.toString()).toFixed(2),
            toTokenUnitAmount(
                myBalB4.sub(offer.instantBuyPrice).toString()
            ).toFixed(2)
        )

        expect(myBalB4.gt(myBal), 'Wrong bal').to.be.true
        expect(
            toTokenUnitAmount(myBal.toString()).toFixed(2) ===
                toTokenUnitAmount(
                    myBalB4.sub(offer.instantBuyPrice).toString()
                ).toFixed(2),
            'buy- Buyer ETH not removed (EXACT AMOUNT)'
        ).to.be.true

        console.log(
            'buyNft/ethAmounts sellerBal',
            toTokenUnitAmount(sellerBalB4.toString()).toString(),
            toTokenUnitAmount(sellerBal.toString()).toString()
        )
        expect(sellerBalB4.lt(sellerBal), 'instaBID- Seller didnt receive').to
            .be.true
    })

    // ___ PURGE ___
    it('Should be able to PURGE (leaveVillage)', async function () {
        // await massBuy(manyAddrs, 50);
        await listInMarket([owner, addr1, addr2], '0.99', '10', 3, 'Royalty')

        await buy(addr1, 10e18)
        await evolve(addr1)

        const myNft = await RoyaltyNft.getInfo(addr1.address)

        console.log('EVOLVED')

        await withdraw(addr1)

        await purgeOffers(true, RoyaltyNft.address, myNft.id)
    })

    it('Should be able to PURGE (change rank) WORSE APPROACH', async function () {
        // await massBuy(manyAddrs, 50);
        await listInMarket([owner, addr1, addr2], '0.99', '10', 3, 'Royalty')

        await buy(addr1, 10e18)
        await evolve(addr1)

        const myNft = await RoyaltyNft.getInfo(addr1.address)

        console.log('EVOLVED')

        await purgeOffers(true, RoyaltyNft.address, myNft.id)
    })

    it('Should be able to PURGE (change rank)', async function () {
        // await massBuy(manyAddrs, 50);
        await listInMarket([owner, addr1, addr2], '0.99', '10', 3, 'Royalty')

        await buy(addr1, 10e18)

        const {
            shouldPurge: shouldPurgeB4,
            contracts: contractsB4,
            ids: idsB4,
        } = await Marketplace.checkPurge()

        console.log('ShouldPurge (NO)', shouldPurgeB4, contractsB4, idsB4)
        expect(shouldPurgeB4, "Shouldn't be able to purge").to.be.false

        await evolve(addr1)
        console.log('EVOLVED')

        const { shouldPurge, contracts, ids } = await Marketplace.checkPurge()
        console.log('ShouldPurge (YES)', shouldPurge, contracts, ids)
        expect(shouldPurge, 'Should be able to purge').to.be.true

        await purgeOffer(contracts[0], ids[0])
    })

    it('Should be able to PURGE (MANY OFFERS)', async function () {
        // await massBuy(manyAddrs, 50);
        await buy(manyAddrs[0], 10e18)
        // await listInMarket([manyAddrs[0], manyAddrs[1], manyAddrs[2]]);
        await listInMarket(
            [manyAddrs[0], owner, addr1],
            '0.99',
            '10',
            3,
            'Royalty'
        )

        await buy(addr1, 10e18)
        await buy(owner, 10e18)
        // await buy(manyAddrs[0], 10e18);
        // await buy(manyAddrs[1], 10e18);
        // await buy(manyAddrs[2], 10e18);

        const {
            shouldPurge: shouldPurgeB4,
            contracts: contractsB4,
            ids: idsB4,
        } = await Marketplace.checkPurge()

        console.log('ShouldPurge (NO)', shouldPurgeB4, contractsB4, idsB4)
        expect(shouldPurgeB4, "Shouldn't be able to purge").to.be.false

        await evolve(addr1)
        await evolve(owner)
        await evolve(manyAddrs[0])
        // await evolve(manyAddrs[1]);
        // await evolve(manyAddrs[2]);

        console.log('EVOLVED')

        const { shouldPurge, contracts, ids } = await Marketplace.checkPurge()
        console.log('ShouldPurge (YES)', shouldPurge, contracts, ids)
        expect(shouldPurge, 'Should be able to purge').to.be.true

        // await Promise.all(contracts.map((contract, i) => purgeOffer(contract, ids[i])))
        await purgeOffer(contracts[0], ids[0])
        await purgeOffer(contracts[1], ids[1])
        await purgeOffer(contracts[2], ids[2])
    })

    // ___ ACCEPT ___
    it('Should be able to accept bid (x2 bids + accept)', async function () {
        // await massBuy(manyAddrs, 50);
        await listInMarket([owner, addr1, addr2], '0.99', '10', 3, 'Royalty')
        const myNft = await RoyaltyNft.getInfo(addr1.address)

        const contract = RoyaltyNft.address
        const id = myNft.id

        await bid(contract, id, manyAddrs[0], 1e18)
        await bid(contract, id, manyAddrs[1], 2e18)
        await bid(contract, id, manyAddrs[2], 3e18)

        await acceptBid(contract, id, addr1)
    })

    // ___ WITHDRAW ___
    it('Should be able to withdraw BID', async function () {
        // await massBuy(manyAddrs, 50);
        await listInMarket([owner, addr1, addr2], '0.99', '10', 3, 'Royalty')

        const myNft = await RoyaltyNft.getInfo(addr1.address)

        const contract = RoyaltyNft.address
        const id = myNft.id

        await bid(contract, id, manyAddrs[0], 1e18)

        await withdrawBid(contract, id, manyAddrs[0])
    })

    //-------------ZEPNAUT
    it('Should be able to BUY Zepnaut NFT', async function () {
        await massBuy(manyAddrs, 2)

        await listInMarket([manyAddrs[0]], '1', '5', 1, 'Royalty')
        // await listInMarket([owner], "1", "5", 1, "Zepnaut");

        const myNft = await RoyaltyNft.getInfo(manyAddrs[0].address)

        console.log('My NFT', myNft.id.toString())
        var { amountToSeller, amountFromBuyer, serviceFee, royaltyFee } =
            await Marketplace.getFinalBuyPrice(
                RoyaltyNft.address,
                myNft.id.toString()
            )

        console.log(
            'buyPrice',
            amountToSeller,
            amountFromBuyer,
            serviceFee,
            royaltyFee
        )
        console.log(
            'buyPrice',
            fromTokenUnitAmount(amountFromBuyer.toString()).toString()
        )

        await buyNft(
            RoyaltyNft.address,
            myNft.id,
            manyAddrs[5],
            amountFromBuyer,
            amountToSeller.add(royaltyFee)
        )

        const yPrice = await FomoRouter.getZepnautBuyPrice()
        const buyYTx = await FomoRouter.connect(manyAddrs[5]).buyZepnaut({
            value: yPrice.toString(),
        })

        await listInMarket([manyAddrs[5]], '1', '5', 1, 'Zepnaut')

        const myNftY = await ZenNft.getInfo(manyAddrs[5].address)

        console.log('My NFT', myNftY.id.toString())
        var { amountToSeller, amountFromBuyer, serviceFee, royaltyFee } =
            await Marketplace.getFinalBuyPrice(
                ZenNft.address,
                myNftY.id.toString()
            )

        console.log(
            'buyPriceY',
            amountToSeller,
            amountFromBuyer,
            serviceFee,
            royaltyFee
        )
        console.log(
            'buyPriceY',
            fromTokenUnitAmount(amountFromBuyer.toString()).toString()
        )

        await buyNft(
            ZenNft.address,
            myNftY.id,
            manyAddrs[1],
            amountFromBuyer,
            amountToSeller.add(royaltyFee)
        )
    })

    it('Should be able to PURGE Zepnaut NFT Offer', async function () {
        const yPrice = await FomoRouter.getZepnautBuyPrice()
        const buyYTx = await FomoRouter.buyZepnaut({ value: yPrice.toString() })

        await listInMarket([owner], '1', '5', 1, 'Zepnaut')
        const myNftY = await ZenNft.getInfo(owner.address)

        console.log('My NFT', myNftY.id.toString())

        const {
            shouldPurge: shouldPurgeB4,
            contracts: contractsB4,
            ids: idsB4,
        } = await Marketplace.checkPurge()

        console.log('ShouldPurge (NO)', shouldPurgeB4, contractsB4, idsB4)
        expect(shouldPurgeB4, "Shouldn't be able to purge").to.be.false

        await ZenNft.connect(owner).burnToClaim()
        console.log('BURNED ZEPNAUT')

        const { shouldPurge, contracts, ids } = await Marketplace.checkPurge()
        console.log('ShouldPurge (YES)', shouldPurge, contracts, ids)
        expect(shouldPurge, 'Should be able to purge').to.be.true

        await purgeOffer(contracts[0], ids[0])
    })

    it('Should be able to accept bid (x2 bids + accept) ZEPNAUT', async function () {
        // await massBuy(manyAddrs, 50);
        const yPrice = await FomoRouter.getZepnautBuyPrice()
        const buyYTx = await FomoRouter.buyZepnaut({ value: yPrice.toString() })

        await listInMarket([owner], '1', '10', 1, 'Zepnaut')
        const myNftY = await ZenNft.getInfo(owner.address)

        console.log('My NFT', myNftY.id.toString())

        const contract = ZenNft.address
        const id = myNftY.id

        await bid(contract, id, manyAddrs[0], 2e18)
        await bid(contract, id, manyAddrs[2], 3e18)
        await bid(contract, id, manyAddrs[3], 4e18)

        await acceptBid(contract, id, owner)
    })

    it('Should be able autoBuy ZEPNAUT', async function () {
        // await massBuy(manyAddrs, 50);
        const yPrice = await FomoRouter.getZepnautBuyPrice()
        const buyYTx = await FomoRouter.buyZepnaut({ value: yPrice.toString() })

        await listInMarket([owner], '1', '10', 1, 'Zepnaut')
        const myNftY = await ZenNft.getInfo(owner.address)

        console.log('My NFT', myNftY.id.toString())

        const contract = ZenNft.address
        const id = myNftY.id

        await bid(contract, id, manyAddrs[0], 12e18, true)
    })

    it('Should be able to withdraw BID ZEPNAUT', async function () {
        // await massBuy(manyAddrs, 50);
        const yPrice = await FomoRouter.getZepnautBuyPrice()
        const buyYTx = await FomoRouter.buyZepnaut({ value: yPrice.toString() })

        await listInMarket([owner], '1', '10', 1, 'Zepnaut')
        const myNftY = await ZenNft.getInfo(owner.address)

        console.log('My NFT', myNftY.id.toString())

        const contract = ZenNft.address
        const id = myNftY.id

        await bid(contract, id, manyAddrs[0], 2e18, false)

        await withdrawBid(contract, id, manyAddrs[0])
    })

    //-----------Rewards
    it('Should be able to BUY Reward NFT', async function () {
        const myNft = await RoyaltyNft.getInfo(owner.address)

        console.log('My NFT', myNft.id.toString())

        await RewardsNft.createSpecialReward(myNft.id, owner.address, 3)

        await listInMarket([owner], '1', '5', 1, 'Reward')
        const myReward = await RewardsNft.getIdsForAccount(owner.address)
        console.log('My Reward', myReward[0].toString())

        const { amountToSeller, amountFromBuyer, serviceFee, royaltyFee } =
            await Marketplace.getFinalBuyPrice(
                RewardsNft.address,
                myReward[0].toString()
            )

        console.log(
            'buyPrice',
            toTokenUnitAmount(amountToSeller.toString().toString()),
            toTokenUnitAmount(serviceFee.toString()),
            toTokenUnitAmount(royaltyFee.toString()).toString()
        )
        console.log(
            'buyPrice',
            toTokenUnitAmount(amountFromBuyer.toString()).toString()
        )
        //Deployer takes Service Fee + Royalty since he is minter
        await buyNft(
            RewardsNft.address,
            myReward[0].toString(),
            manyAddrs[0],
            amountFromBuyer,
            amountToSeller.add(royaltyFee).add(serviceFee)
        )
    })

    it('Should be able to PURGE Reward Offer', async function () {
        const myNft = await RoyaltyNft.getInfo(owner.address)
        console.log('My NFT', myNft.id.toString())

        await RewardsNft.createSpecialReward(myNft.id, owner.address, 3)

        await listInMarket([owner], '1', '5', 1, 'Reward')

        const {
            shouldPurge: shouldPurgeB4,
            contracts: contractsB4,
            ids: idsB4,
        } = await Marketplace.checkPurge()
        console.log('ShouldPurge (NO)', shouldPurgeB4, contractsB4, idsB4)
        expect(shouldPurgeB4, "Shouldn't be able to purge").to.be.false

        const myReward = await RewardsNft.getIdsForAccount(owner.address)
        console.log('My Reward', myReward[0].toString())

        await buy(owner, 10e18)
        await evolve(owner)

        await Keeper.withdrawWithReward(myReward[0])

        const { shouldPurge, contracts, ids } = await Marketplace.checkPurge()
        console.log('ShouldPurge (YES)', shouldPurge, contracts, ids)
        expect(shouldPurge, 'Should be able to purge').to.be.true

        await purgeOffer(contracts[0], ids[0])
    })

    it('Should be able to accept bid (x2 bids + accept) Reward Offer', async function () {
        const myNft = await RoyaltyNft.getInfo(owner.address)
        console.log('My NFT', myNft.id.toString())

        await RewardsNft.createSpecialReward(myNft.id, owner.address, 3)

        await listInMarket([owner], '1', '5', 1, 'Reward')
        await listInMarket([owner], '1', '5', 1, 'Royalty')
        const myReward = await RewardsNft.getIdsForAccount(owner.address)
        console.log('My Reward', myReward[0].toString())

        const contract = RewardsNft.address
        const contract2 = RoyaltyNft.address
        const id = myReward[0]
        const balBef = await manyAddrs[0].getBalance()
        await bid(contract, id, manyAddrs[0], 2e18)

        // console.log(await manyAddrs[0].getBalance());
        await bid(contract, id, manyAddrs[2], 3e18)
        await bid(contract, id, manyAddrs[3], 4e18)

        await bid(contract2, myNft.id, manyAddrs[0], 2e18)
        await bid(contract2, myNft.id, manyAddrs[2], 3e18)
        await bid(contract2, myNft.id, manyAddrs[3], 4e18)

        await Marketplace.connect(owner).tryMassRefund()
        const balAf = await manyAddrs[0].getBalance()
        console.log(balBef.toString(), '<BEFORE')
        console.log(balAf.toString(), '<AFTER')
        // await acceptBid(contract, id, owner);
    })

    it('Should be able to remove REWARD NFT Offer', async function () {
        const myNft = await RoyaltyNft.getInfo(owner.address)
        console.log('My NFT', myNft.id.toString())

        await RewardsNft.createSpecialReward(myNft.id, owner.address, 3)
        const offerCount = await Marketplace.getOffersCount()

        await listInMarket([owner], '1', '5', 1, 'Reward')
        const myReward = await RewardsNft.getIdsForAccount(owner.address)
        console.log('My Reward', myReward[0].toString())

        await Marketplace.removeOffer(RewardsNft.address, myReward[0])
        const offerCountAfter = await Marketplace.getOffersCount()
        expect(offerCountAfter).eq('0')
    })
    //-------------Miles
    it('Should be able to buy Miles', async function () {
        const idOfSpeed = await SpeedUtils.getIDFromAccount(
            '0xc0ffee254729296a45a3885639AC7E10F9d54979'
        )
        console.log(idOfSpeed.toString(), 'ID OF ACCOUNT MilesS')
        await MilesNft.setMarketplaceAddress(owner.address)
        await MilesNft.marketTransfer(
            '0xc0ffee254729296a45a3885639AC7E10F9d54979',
            owner.address,
            idOfSpeed.toString()
        )
        const idOfSpeed1 = await SpeedUtils.getIDFromAccount(owner.address)
        console.log(idOfSpeed1.toString(), 'OWNER ID OF ACCOUNT MilesS')

        await MilesNft.setMarketplaceAddress(Marketplace.address)
        await listInMarket([owner], '1', '10', 1, 'Miles')

        const { amountToSeller, amountFromBuyer, serviceFee, royaltyFee } =
            await Marketplace.getFinalBuyPrice(
                MilesNft.address,
                idOfSpeed1.toString()
            )
        await buyNft(
            MilesNft.address,
            idOfSpeed1.toString(),
            manyAddrs[0],
            amountFromBuyer,
            amountToSeller.add(serviceFee)
        )
    })

    it('Should be able to bid-auto buy Miles', async function () {
        const idOfSpeed = await SpeedUtils.getIDFromAccount(
            '0xc0ffee254729296a45a3885639AC7E10F9d54979'
        )
        console.log(idOfSpeed.toString(), 'ID OF ACCOUNT MilesS')
        await MilesNft.setMarketplaceAddress(owner.address)
        await MilesNft.marketTransfer(
            '0xc0ffee254729296a45a3885639AC7E10F9d54979',
            owner.address,
            idOfSpeed.toString()
        )
        const idOfSpeed1 = await SpeedUtils.getIDFromAccount(owner.address)
        console.log(idOfSpeed1.toString(), 'OWNER ID OF ACCOUNT MilesS')

        await MilesNft.setMarketplaceAddress(Marketplace.address)
        await listInMarket([owner], '1', '10', 1, 'Miles')

        await bid(MilesNft.address, idOfSpeed1, manyAddrs[0], 12e18, true)
    })

    it('Should be able to 2xBid+accept Miles', async function () {
        const idOfSpeed = await SpeedUtils.getIDFromAccount(
            '0xc0ffee254729296a45a3885639AC7E10F9d54979'
        )
        console.log(idOfSpeed.toString(), 'ID OF ACCOUNT MilesS')
        await MilesNft.setMarketplaceAddress(owner.address)
        await MilesNft.marketTransfer(
            '0xc0ffee254729296a45a3885639AC7E10F9d54979',
            owner.address,
            idOfSpeed.toString()
        )
        const idOfSpeed1 = await SpeedUtils.getIDFromAccount(owner.address)
        console.log(idOfSpeed1.toString(), 'OWNER ID OF ACCOUNT MilesS')

        await MilesNft.setMarketplaceAddress(Marketplace.address)
        await listInMarket([owner], '1', '10', 1, 'Miles')

        await bid(MilesNft.address, idOfSpeed1, manyAddrs[0], 5e18, false)
        await bid(MilesNft.address, idOfSpeed1, manyAddrs[1], 7e18, false)
        await bid(MilesNft.address, idOfSpeed1, manyAddrs[2], 8e18, false)

        await acceptBid(MilesNft.address, idOfSpeed1, owner)
    })

    it('Should be able to purge Miles', async function () {
        const idOfSpeed = await SpeedUtils.getIDFromAccount(
            '0xc0ffee254729296a45a3885639AC7E10F9d54979'
        )
        console.log(idOfSpeed.toString(), 'ID OF ACCOUNT MilesS')
        await MilesNft.setMarketplaceAddress(owner.address)
        await MilesNft.marketTransfer(
            '0xc0ffee254729296a45a3885639AC7E10F9d54979',
            owner.address,
            idOfSpeed.toString()
        )
        const idOfSpeed1 = await SpeedUtils.getIDFromAccount(owner.address)
        console.log(idOfSpeed1.toString(), 'OWNER ID OF ACCOUNT MilesS')

        await MilesNft.setMarketplaceAddress(Marketplace.address)
        await listInMarket([owner], '1', '10', 1, 'Miles')

        const {
            shouldPurge: shouldPurgeB4,
            contracts: contractsB4,
            ids: idsB4,
        } = await Marketplace.checkPurge()
        console.log('ShouldPurge (NO)', shouldPurgeB4, contractsB4, idsB4)
        expect(shouldPurgeB4, "Shouldn't be able to purge").to.be.false

        await MilesNft.transferFrom(owner.address, addr1.address, idOfSpeed1)

        const { shouldPurge, contracts, ids } = await Marketplace.checkPurge()
        console.log('ShouldPurge (YES)', shouldPurge, contracts, ids)
        expect(shouldPurge, 'Should be able to purge').to.be.true

        await purgeOffer(contracts[0], ids[0])
    })

    it('Should be able to removeOffer Miles', async function () {
        const idOfSpeed = await SpeedUtils.getIDFromAccount(
            '0xc0ffee254729296a45a3885639AC7E10F9d54979'
        )
        console.log(idOfSpeed.toString(), 'ID OF ACCOUNT MilesS')
        await MilesNft.setMarketplaceAddress(owner.address)
        await MilesNft.marketTransfer(
            '0xc0ffee254729296a45a3885639AC7E10F9d54979',
            owner.address,
            idOfSpeed.toString()
        )
        const idOfSpeed1 = await SpeedUtils.getIDFromAccount(owner.address)
        console.log(idOfSpeed1.toString(), 'OWNER ID OF ACCOUNT MilesS')

        await MilesNft.setMarketplaceAddress(Marketplace.address)
        await listInMarket([owner], '1', '10', 1, 'Miles')

        await bid(MilesNft.address, idOfSpeed1, manyAddrs[0], 5e18, false)
        await bid(MilesNft.address, idOfSpeed1, manyAddrs[1], 7e18, false)
        await bid(MilesNft.address, idOfSpeed1, manyAddrs[2], 8e18, false)

        await Marketplace.connect(owner).removeOffer(
            MilesNft.address,
            idOfSpeed1
        )
        const offerCountAfter = await Marketplace.getOffersCount()
        expect(offerCountAfter).eq('0')
    })
})
