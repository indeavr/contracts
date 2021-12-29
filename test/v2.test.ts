import BigNumber from 'bignumber.js'
import { Contract } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signers'
import hre, { ethers } from 'hardhat'
import { fromTokenUnitAmount } from '../utils'
import { UNISWAP_ROUTER_ABI } from '../utils/abis/uniRouter'
import { uniswapPairAbi } from '../utils/abis/pairAbi'
import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { erc20Abi } from '../utils/abis/erc20'
import { getSnapshotValues, getZenSnapshotValues } from '../scripts/core'

chai.use(solidity)
const { expect } = chai

const setterAbi = [
    'function setGasRefund(uint amt) external',
    'function setCooldown(uint amt) external',
    'function setMinETHForZen(uint amt) external',
    'function setMinETHForLottery(uint amt) external',
    'function setTaxOnTransfer(uint amt) external',
    'function setSetterWallet(address add, address owner) external',
]

const WETH_ADDRESS1

const uniRouterAddress
const liquidityWETHAmt = fromTokenUnitAmount(20)

describe('Zep Draw V2 Tests', function () {
    this.timeout(900000000000)
    let UniRouterContract: Contract

    let UniRouterContractAddr1: Contract
    let PairContractV1: Contract
    let PairContractV2: Contract
    let owner: SignerWithAddress
    let gasPrice: any
    let addr1: SignerWithAddress
    let addr2: SignerWithAddress

    let addrR1: SignerWithAddress
    let addrR2: SignerWithAddress
    let addrR3: SignerWithAddress
    let addrR4: SignerWithAddress
    let addrR5: SignerWithAddress

    let manyAddrs: SignerWithAddress[]
    let ZenRouter: Contract
    let Marketplace: Contract
    let Zep: Contract
    let ZepV1: Contract
    let ZenNft: Contract
    let RoyaltyNft: Contract
    let Keeper: Contract
    let RewardsNft: Contract
    let MilesNft: Contract
    let PAIR_ADDRESS_V1: string
    let PAIR_ADDRESS_V2: string
    let WETH_CONTRACT: Contract
    let V1LPLOCK_CONTRACT: Contract
    let Portal: Contract
    let AutoCompounder: Contract

    const deploy = async () => {
        const ZepV1Factory = await ethers.getContractFactory('ZepDraw')
        ZepV1 = await ZepV1Factory.deploy()
        await ZepV1.deployed()
        console.log('<<ZepV1 address>>', ZepV1.address)

        const LPLockerFactory = await ethers.getContractFactory('LPLocker')
        V1LPLOCK_CONTRACT = await LPLockerFactory.deploy(ZepV1.address)
        await V1LPLOCK_CONTRACT.deployed()

        await ZepV1.sendTokensToLock(
            V1LPLOCK_CONTRACT.address,
            owner.address,
            owner.address,
            { value: liquidityWETHAmt.toString(), gasLimit: 10e6 }
        )

        PAIR_ADDRESS_V1 = await ZepV1.getPairAdd()

        PairContractV1 = new ethers.Contract(
            PAIR_ADDRESS_V1,
            uniswapPairAbi,
            owner
        )

        const ZepFactory = await ethers.getContractFactory('Zep')
        Zep = await ZepFactory.deploy()
        await Zep.deployed()
        console.log('<<ZepV2 address>>', Zep.address)

        const MilesNftFactory = await ethers.getContractFactory('Miles')
        MilesNft = await MilesNftFactory.deploy()
        await MilesNft.deployed()
        console.log('<<MilesNft address>>', MilesNft.address)

        const ZenNftFactory = await ethers.getContractFactory('Zen')
        ZenNft = await ZenNftFactory.deploy(Zep.address, MilesNft.address)
        await ZenNft.deployed()
        console.log('<<ZenNFT address>>', ZenNft.address)

        await MilesNft.setZenNftAddress(ZenNft.address)

        const RoyaltyNftFactory = await ethers.getContractFactory('Roy')
        RoyaltyNft = await RoyaltyNftFactory.deploy(Zep.address)
        await RoyaltyNft.deployed()
        console.log('<<RoyaltyNFT address>>', RoyaltyNft.address)

        await Zep.setZenSpotContract(ZenNft.address)
        await Zep.setRoyaltyContract(RoyaltyNft.address)
        await ZenNft.setRoyaltyContract(RoyaltyNft.address)
        await RoyaltyNft.setD(ZenNft.address)

        const AutoLockerFactory = await ethers.getContractFactory('AutoL')
        AutoCompounder = await AutoLockerFactory.deploy(
            Zep.address,
            ZenNft.address,
            RoyaltyNft.address
        )
        await AutoCompounder.deployed()
        console.log('<<AutoCompounder address>>', AutoCompounder.address)

        await Zep.setLpGrowerAddress(AutoCompounder.address)
        await RoyaltyNft.setLp(AutoCompounder.address)
        await ZenNft.setLpGrowerAddress(AutoCompounder.address)

        const KeeperFactory = await ethers.getContractFactory('Keep')
        Keeper = await KeeperFactory.deploy(
            Zep.address,
            RoyaltyNft.address,
            AutoCompounder.address
        )
        await Keeper.deployed()
        console.log('<<Keeper address>>', Keeper.address)

        const RewardsFactory = await ethers.getContractFactory('Rewards')
        RewardsNft = await RewardsFactory.deploy(
            RoyaltyNft.address,
            Keeper.address
        )
        await RewardsNft.deployed()
        console.log('<<RewardsNft address>>', RewardsNft.address)

        await Keeper.setRewardsContract(RewardsNft.address)
        await RoyaltyNft.setA(RewardsNft.address)
        await RoyaltyNft.setK(Keeper.address)

        // const PortalFactory = await ethers.getContractFactory("ZepDrawV2Portal");
        const PortalFactory = await ethers.getContractFactory('Port72')
        Portal = await PortalFactory.deploy(
            Zep.address,
            ZepV1.address,
            PAIR_ADDRESS_V1,
            AutoCompounder.address
        )
        await Portal.deployed()

        await Portal.setLpToken(PAIR_ADDRESS_V1.toString())
        await Zep.setPortalAddress(Portal.address)
        await AutoCompounder.setPortalAddress(Portal.address)

        console.log('<<Portal address>>', Portal.address)

        // const PortalFactory = await ethers.getContractFactory("ZepDrawV2Portal");
        const ZenRouterFactory = await ethers.getContractFactory('FR72')
        ZenRouter = await ZenRouterFactory.deploy(
            AutoCompounder.address,
            Portal.address,
            Zep.address
        )
        await ZenRouter.deployed()

        console.log('<<ZenRouter address>>', ZenRouter.address)

        const MarketplaceFactory = await ethers.getContractFactory(
            'ZepVerseMarketplace'
        )
        Marketplace = await MarketplaceFactory.deploy()
        await Marketplace.deployed()
        console.log('<<Marketplace address>>', Marketplace.address)

        await ZenNft.setMarketplaceAddress(Marketplace.address)
        await RoyaltyNft.setM(Marketplace.address)
        await MilesNft.setMarketplaceAddress(Marketplace.address)
        await RewardsNft.setMarketplaceAddress(Marketplace.address)

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

    const generateVolume = async (hours = 24) => {
        return Promise.all(
            Array.from({ length: hours }).map(async (_, i) => {
                await UniRouterContract.connect(
                    addr1
                ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                    0,
                    [WETH_ADDRESS1, Zep.address],
                    addr1.address,
                    1856678133,
                    { value: (1e18).toString(), gasLimit: 50000000 }
                )
            })
        )
    }

    const makeBuys = (times = 1, val = 1e19, signer = owner) => {
        return Promise.all(
            Array.from({ length: times }).map(async (_, i) => {
                return buy(signer, val)
            })
        )
    }

    const mintFromSnapshot = async () => {
        const [acc1, vals] = getSnapshotValues()
        // await (await Zep.setSnapshotAccounts(acc1.length)).wait();

        // mintFromSnapshot
        const perTx1 = 500
        const cycles1 = Math.ceil(acc1.length / perTx1)
        await Promise.all(
            Array.from({ length: cycles1 }).map(async (_, i) => {
                const qq = (i + 1) * perTx1
                const ac = acc1.slice(
                    i * perTx1,
                    qq > acc1.length ? acc1.length : qq
                )
                const val = vals.slice(
                    i * perTx1,
                    qq > vals.length ? vals.length : qq
                )

                return (
                    await Zep.mintFromSnapshot(ac, val, { gasLimit: 20000000 })
                ).wait()
            })
        )

        console.log('SNAPSHOTTT')
    }

    const createInitialZenAccounts = async (times?: number) => {
        await (await ZenNft.setMintCooldown(0)).wait()
        // createInitialZenAccounts
        const supplySnap = await Zep.totalSupply()
        console.log('-SUP- snap', supplySnap.toString())
        // Zen Spots
        const [acc, minReqs] = getZenSnapshotValues()
        const perTx = 50
        const cycles = times || acc.length / perTx
        await Array.from({ length: cycles }).reduce<any>((chain, _, i) => {
            const qq = (i + 1) * perTx
            const ac = acc.slice(i * perTx, qq > acc.length ? acc.length : qq)
            const val = minReqs.slice(
                i * perTx,
                qq > minReqs.length ? minReqs.length : qq
            )
            console.log('qq ZENS', qq, ac.length, val.length)

            return chain.then(async () => {
                await (
                    await Zep.createInitialZenAccounts(ac, val, {
                        gasLimit: 25000000,
                    })
                ).wait()
            })
        }, Promise.resolve())

        console.log('success ?', acc.length)
        const b = await ZenNft.balanceOf(acc[1])

        const sup = await ZenNft.totalSupply()
        console.log('=zen total=', sup.toString())
    }

    const afterTax = (amount) => {
        const nAmount = amount - amount * 0.004
        return nAmount - nAmount * 0.004
    }

    const mintRoyalties = async (phases = 6, skip = 0) => {
        console.log('_COUNT_', manyAddrs.length, manyAddrs.slice(0, 999).length)
        let phasesBounds = [
            { val: manyAddrs.slice(0, 1000), price: '1000000000000000000' },
            { val: manyAddrs.slice(1000, 2000), price: '2000000000000000000' },
            { val: manyAddrs.slice(2000, 2500), price: '6000000000000000000' },
            { val: manyAddrs.slice(2500, 2750), price: '20000000000000000000' },
            { val: manyAddrs.slice(2750, 2980), price: '60000000000000000000' },
            {
                val: manyAddrs.slice(2980, 3000),
                price: '600000000000000000000',
            },
        ]
        phasesBounds = phasesBounds.slice(skip, phasesBounds.length)

        const perTx = 100

        // await Array.from({ length: phases }).reduce(async (chain: any, _, i) => {
        //     const l = phasesBounds[i].val.length;
        //     const cycles = Math.ceil(l / perTx);
        //     console.log("GOOOO start", l, cycles);
        //     const vals = phasesBounds[i].val.map(v => v.address);
        //
        //     chain.then(() => {
        //         Promise.all(Array.from({ length: cycles }).map(async (_, j) => {
        //             const qq = (j + 1) * perTx;
        //             const val = vals.slice(j * perTx, qq > vals.length ? vals.length : qq)
        //             console.log("GOOOO", val.length, j * perTx, qq > vals.length ? vals.length : qq, vals.length, qq)
        //             return (await Zep.massBuy(
        //                 val,
        //                 phasesBounds[i].price.toString(),
        //                 { value: "600000000000000000000000", gasLimit: 84000000 }
        //             )).wait();
        //         }));
        //     })
        //
        //     return chain;
        // }, Promise.resolve());
        await Promise.resolve(
            Array.from({ length: phases }).map(async (_, i) => {
                console.log('PHASE->', i, phases, skip)
                const l = phasesBounds[i].val.length
                const cycles = Math.ceil(l / perTx)
                console.log('GOOOO start', l, cycles)
                const vals = phasesBounds[i].val.map((v) => v.address)
                console.log('PHASE', vals.length)

                return Promise.all(
                    Array.from({ length: cycles }).map(async (_, j) => {
                        const qq = (j + 1) * perTx
                        const val = vals.slice(
                            j * perTx,
                            qq > vals.length ? vals.length : qq
                        )
                        console.log(
                            'GOOOO',
                            val.length,
                            j * perTx,
                            qq > vals.length ? vals.length : qq,
                            vals.length,
                            qq
                        )
                        return (
                            await Zep.massBuy(
                                val,
                                phasesBounds[i].price.toString(),
                                {
                                    value: '6000000000000000000000',
                                    gasLimit: 55000000,
                                }
                            )
                        ).wait()
                    })
                )
            }, Promise.resolve())
        )
        // .map((tx: any) => tx.wait())

        const ts = await RoyaltyNft.totalSupply()
        console.log('?mintRoyal? success ?', manyAddrs.length, ts.toNumber())
        const b = await RoyaltyNft.balanceOf(manyAddrs[1].address)
        expect(b.toNumber()).to.eql(1)
        console.log('?mintRoyal? BB', b.toString(), manyAddrs[1].address)
    }

    const validateRewards = async (l = 3000) => {
        const rightsArray = [
            { step: 10 },
            { step: 50 },
            { step: 100 },
            { step: 420 },
        ]

        const valid = []
        await Promise.all(
            Array.from({ length: l }).map(async (_, i) => {
                let expected = -1
                console.log(
                    'i',
                    i,
                    (i + 1) % rightsArray[3].step,
                    (i + 1) % rightsArray[2].step,
                    (i + 1) % rightsArray[1].step,
                    (i + 1) % rightsArray[0].step
                )
                for (let r = rightsArray.length - 1; r >= 0; r--) {
                    if ((i + 1) % rightsArray[r].step == 0) {
                        expected = r
                        break
                    }
                }
                if (expected != -1) {
                    const ids = await RewardsNft.getIdsForAccount(
                        manyAddrs[i].address
                    )
                    console.log(
                        '+-+Got ids',
                        ids.length,
                        ids.map((idd) => idd.toNumber()),
                        manyAddrs[i].address,
                        i
                    )
                    if (ids.length == 1) {
                        const rarity = await RewardsNft.getRarity(ids[0])
                        console.log('+-+rarity', rarity.toNumber(), expected, i)
                        if (rarity.toNumber() === expected) {
                            valid.push(true)
                        }
                    }
                }
            })
        )
        // 397 out of 445 ~ 300
        console.log('valid', valid.length)
        expect(valid.length >= 100).to.be.true
    }

    const levelUpRoyalties = async (n = 10) => {
        const makeBuyThenLevelUp = (signers, price) => {
            return Promise.all(
                signers.map(async (signer, i) => {
                    await buy(signer, price)

                    await evolve(signer)
                })
            )
        }

        await makeBuyThenLevelUp(manyAddrs.slice(0, n), (10e18).toString())
    }

    const evolve = async (signer: SignerWithAddress = owner) => {
        const myInfo = await RoyaltyNft.connect(signer).myInfo()
        console.log(
            'My info',
            myInfo.map((v) => v.toString())
        )
        const [__, potentialRank] = await RoyaltyNft.connect(
            signer
        ).getPotentialRank(myInfo[1], myInfo[0])
        console.log('potentialRank', potentialRank.toString())

        const amountRequired = await RoyaltyNft.connect(
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
    }

    // -1 / 0 / 1 --> no / nirv / mung
    const royalEvolve = async (
        expectTo = -1,
        signer: SignerWithAddress = owner
    ) => {
        const startBal = await Zep.balanceOf(signer.address)

        const myInfo = await RoyaltyNft.connect(signer).myInfo()
        console.log(
            'My info',
            myInfo.map((v) => v.toString())
        )

        const royaltyId = await RoyaltyNft.getIdForAccount(signer.address)
        console.log('royaltyId', royaltyId.toNumber())
        expect(royaltyId.toNumber()).not.equal(0)
        const [wonContest, enoughtTokens, requiredTokens] =
            await RoyaltyNft.connect(signer).canBeSupreme(royaltyId)
        const [enoughVolume, enoughtTokensMung, requiredTokensMung] =
            await RoyaltyNft.connect(signer).canBeMungularity(royaltyId)

        console.log(
            '-SUPREME-',
            wonContest,
            enoughtTokens,
            requiredTokens.toString()
        )
        console.log(
            '-MUNG-',
            enoughVolume,
            enoughtTokensMung,
            requiredTokensMung.toString()
        )
        console.log('expect', expectTo)

        if (expectTo === 0) {
            expect(wonContest && enoughtTokens).to.be.true
            await (
                await Zep.connect(signer).approve(
                    RoyaltyNft.address,
                    requiredTokens
                )
            ).wait()
            await (
                await RoyaltyNft.connect(signer).royalEvolve({
                    gasLimit: 10000000,
                })
            ).wait()

            const myInfoNirv = await RoyaltyNft.connect(signer).myInfo()
            console.log(
                'My info SUPREME',
                myInfoNirv.map((v) => v.toString())
            )
            expect(myInfoNirv[0].toNumber()).equal(7)

            const bal = await Zep.balanceOf(signer.address)
            console.log(
                'Balance after royal Evolve',
                startBal.toString(),
                bal.toString()
            )
            expect(startBal.sub(bal).eq(requiredTokens)).to.be.true
        } else if (expectTo === 1) {
            expect(enoughVolume && enoughtTokensMung).to.be.true
            await (
                await Zep.connect(signer).approve(
                    RoyaltyNft.address,
                    requiredTokensMung
                )
            ).wait()
            await (
                await RoyaltyNft.connect(signer).royalEvolve({
                    gasLimit: 10000000,
                })
            ).wait()

            const myInfoMung = await RoyaltyNft.connect(signer).myInfo()
            console.log(
                'My info Mung',
                myInfoMung.map((v) => v.toString())
            )
            expect(myInfoMung[0].toNumber()).equal(6)

            const bal = await Zep.balanceOf(signer.address)
            console.log(
                'Balance after royal Evolve',
                startBal.toString(),
                bal.toString()
            )
            expect(startBal.sub(bal).eq(requiredTokensMung)).to.be.true
        } else {
            console.log('Not expected to evolve !')
            // approve nirv and expect to through
            await (
                await Zep.connect(signer).approve(
                    RoyaltyNft.address,
                    requiredTokens
                )
            ).wait()
            await (
                await RoyaltyNft.connect(signer).royalEvolve({
                    gasLimit: 10000000,
                })
            ).wait()
        }
    }

    const withdraw = async (signer: SignerWithAddress = owner) => {
        const keepB = await Zep.balanceOf(Keeper.address)
        await (await Keeper.connect(signer).withdraw()).wait()
        const keepAfter = await Zep.balanceOf(Keeper.address)
        console.log('bals', keepB.toString(), keepAfter.toString())
        expect(keepAfter.lt(keepB)).equal(true)
    }

    const withdrawWithReward = async (
        signer: SignerWithAddress = owner,
        artId: number = 0
    ) => {
        const keepB = await Zep.balanceOf(Keeper.address)
        const signerBalanceBefore = await Zep.balanceOf(signer.address)

        const royaltyId = await RoyaltyNft.getIdForAccount(signer.address)
        console.log('---royaltyId', royaltyId.toNumber())
        expect(royaltyId.toNumber()).not.equal(0)

        const amountInKeeper = await Keeper.getAmountInKeep(royaltyId)
        expect(amountInKeeper.gt(0)).equal(true)
        const [tax, amountInKeeperAfterTax] =
            await Keeper.getZepAmountsAfterRewardReduction(
                artId,
                amountInKeeper
            )
        console.log(
            '---tax and finalAmount',
            tax.toString(),
            amountInKeeperAfterTax.toString()
        )

        const balanceOfCompounderB4 = await Zep.balanceOf(
            AutoCompounder.address
        )

        await (await Keeper.connect(signer).withdrawWithReward(artId)).wait()

        const keepAfter = await Zep.balanceOf(Keeper.address)
        console.log('---bals', keepB.toString(), keepAfter.toString())
        expect(keepAfter.lt(keepB)).equal(true)

        const signerBalanceAfter = await Zep.balanceOf(signer.address)
        console.log(
            '---signerBals',
            signerBalanceBefore.toString(),
            signerBalanceAfter.toString(),
            amountInKeeperAfterTax.toString(),
            signerBalanceAfter.sub(signerBalanceBefore).toString()
        )

        expect(signerBalanceBefore.lt(signerBalanceAfter)).equal(true)
        console.log(
            'si',
            signerBalanceAfter.sub(signerBalanceBefore).toString(),
            amountInKeeperAfterTax.mul(9300).zen(10000).toString()
        )
        expect(
            signerBalanceAfter
                .sub(signerBalanceBefore)
                .zen((1e18).toString())
                .eq(
                    amountInKeeperAfterTax
                        .mul(9300)
                        .zen(10000)
                        .zen((1e18).toString())
                )
        ).equal(true)

        const balanceOfCompounderAfter = await Zep.balanceOf(
            AutoCompounder.address
        )
        console.log(
            '---Balance Compounder',
            balanceOfCompounderB4.toString(),
            balanceOfCompounderAfter.toString()
        )
        expect(balanceOfCompounderB4.lt(balanceOfCompounderAfter)).equal(true)
    }

    const speedUpZen = async (Zep, signer = owner) => {
        await Zep.connect(signer).approve(ZenNft.address, Zep)
        await (await ZenNft.connect(signer).speedUpEvolution(Zep)).wait()
    }

    const sell = async (signer = owner, zen = 1, mul = 1) => {
        const ZepB = await Zep.balanceOf(signer.address)
        const balanceLpGrowerB4 = await Zep.balanceOf(AutoCompounder.address)

        if (ZepB.eq(0)) {
            throw Error('Nothing to sell !')
        }

        console.log('::: SOLD', ZepB.toString())
        await (
            await Zep.connect(signer).approve(
                UniRouterContract.address,
                ZepB.toString()
            )
        ).wait()
        await (
            await UniRouterContract.connect(
                signer
            ).swapExactTokensForTokensSupportingFeeOnTransferTokens(
                ZepB.zen(zen).mul(mul),
                0,
                [Zep.address, WETH_ADDRESS1],
                signer.address,
                1956678133,
                { gasLimit: 2000000 }
            )
        ).wait()

        const balanceLpGrower = await Zep.balanceOf(AutoCompounder.address)
        const ZepBAfter = await Zep.balanceOf(signer.address)

        expect(balanceLpGrowerB4.lt(balanceLpGrower)).to.be.true
        expect(ZepBAfter.lt(ZepB)).to.be.true
    }

    const buy = async (signer = owner, val = 1e18) => {
        const ZepB = await Zep.balanceOf(signer.address)
        const balanceLpGrowerB4 = await Zep.balanceOf(AutoCompounder.address)

        console.log('::: BUY', ZepB.toString())
        await (
            await UniRouterContract.connect(
                signer
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                signer.address,
                1856678133,
                { value: val.toString(), gasLimit: 35000000 }
            )
        ).wait()

        const balanceLpGrower = await Zep.balanceOf(AutoCompounder.address)
        const ZepBAfter = await Zep.balanceOf(signer.address)

        console.log(
            'Buy amounts',
            balanceLpGrowerB4.lt(balanceLpGrower),
            balanceLpGrowerB4.toString(),
            balanceLpGrower.toString()
        )
        console.log(
            'Buy amounts Zep',
            ZepB.lt(ZepBAfter),
            ZepB.toString(),
            ZepBAfter.toString()
        )

        expect(balanceLpGrowerB4.lt(balanceLpGrower)).to.be.true
        expect(ZepB.lt(ZepBAfter)).to.be.true
    }

    beforeEach(async function () {
        ;[
            owner,
            addr1,
            addr2,
            addrR1,
            addrR2,
            addrR3,
            addrR4,
            addrR5,
            ...manyAddrs
        ] = await ethers.getSigners()
        console.log('COUNT', manyAddrs.length)
        console.log('<<owner address>>', owner.address, addr2.address)

        await deploy()
        // const ContractFactory1 = await ethers.getContractFactory("LPLocker");
        // LPLocker = await ContractFactory1.deploy();
        // await LPLocker.deployed();

        gasPrice = owner.provider?.getGasPrice()

        // await provideLiqV1();
        UniRouterContract = new ethers.Contract(
            uniRouterAddress,
            UNISWAP_ROUTER_ABI,
            owner
        )
        UniRouterContractAddr1 = new ethers.Contract(
            uniRouterAddress,
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
                        blockNumber: 12263073,
                    },
                },
            ],
        })
    })

    it('Should be able to levelUP and rankUp (1)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts()

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (3e18).toString(), gasLimit: 40000000 }
            )
        ).wait()

        const bA = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance after', bA.toString())
        expect(bA.toNumber()).to.eql(1)

        await evolve(owner)

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(1)
        expect(myInfoFullEND[1].toNumber()).lessThanOrEqual(2000)
        expect(myInfoFullEND[1].toNumber()).greaterThanOrEqual(800) // 100 = tolerance
    })

    it('Should be able to levelUP and rankUp (3)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()

        await mintFromSnapshot()
        await createInitialZenAccounts()

        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (3e18).toString(), gasLimit: 2000000 }
            )
        ).wait()

        const myInfoFullStart = await RoyaltyNft.myInfo()
        console.log(
            'DICTIONARY rank, level, blocksLeftToRankEvolve,\n' +
                '        possibleClaimAmount, blocksLeftToClaim,\n' +
                '         buyVolumeEth, sellVolumeEth, claimedRewards'
        )
        console.log(
            'TEST START',
            myInfoFullStart.map((v) => v.toString())
        )

        await evolve()

        const myInfoFull = await RoyaltyNft.myInfo()
        console.log(
            'TEST STEP 2',
            myInfoFull.map((v) => v.toString())
        )
        const b2 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 2', b2.toString())

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (17e18).toString() }
            )
        ).wait()

        const b3 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 3', b3.toString())

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(3)
        expect(myInfoFullEND[1].toNumber()).greaterThanOrEqual(2000)
    })

    it('Should be able to levelUP and rankUp (5)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts()

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        PAIR_ADDRESS_V2 = await Zep.getPairAddress()
        console.log('<<PAIR address>>', PAIR_ADDRESS_V2)
        PairContractV2 = new ethers.Contract(
            PAIR_ADDRESS_V2,
            uniswapPairAbi,
            owner
        )

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const [res1, res2] = await PairContractV2.getReserves()
        console.log('RESSSS', res1.toString(), res2.toString(), res2 / res1)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (3e18).toString(), gasLimit: 2000000 }
            )
        ).wait()

        const myInfoFullStart = await RoyaltyNft.myInfo()
        console.log(
            'DICTIONARY rank, level, blocksLeftToRankEvolve,\n' +
                '        possibleClaimAmount, blocksLeftToClaim,\n' +
                '         buyVolumeEth, sellVolumeEth, claimedRewards'
        )
        console.log(
            'TEST START',
            myInfoFullStart.map((v) => v.toString())
        )

        await evolve()

        const myInfoFull = await RoyaltyNft.myInfo()
        console.log(
            'TEST STEP 2',
            myInfoFull.map((v) => v.toString())
        )
        const b2 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 2', b2.toString())

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (14e18).toString() }
            )
        ).wait()

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (14e18).toString() }
            )
        ).wait()

        const b3 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 3', b3.toString())

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(5)
        expect(myInfoFullEND[1].toNumber()).greaterThanOrEqual(9600)
    })

    it('Should be able to levelUP and rankUp (MAX) then devolve when withdraw (keeper.withdraw)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts(1)

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        // await increasePrice();

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (3e18).toString(), gasLimit: 2000000 }
            )
        ).wait()

        const loyBal = await RoyaltyNft.balanceOf(owner.address)
        console.log('loyBal', loyBal.toString())
        expect(loyBal.toNumber()).equal(1)

        const myInfoFullStart = await RoyaltyNft.myInfo()
        console.log(
            'DICTIONARY rank, level, blocksLeftToRankEvolve,\n' +
                '        possibleClaimAmount, blocksLeftToClaim,\n' +
                '         buyVolumeEth, sellVolumeEth, claimedRewards'
        )
        console.log(
            'TEST START',
            myInfoFullStart.map((v) => v.toString())
        )

        const keepBL = await Zep.balanceOf(Keeper.address)
        await evolve(owner)
        const keepAfterL = await Zep.balanceOf(Keeper.address)
        console.log('bals evolve', keepBL.toString(), keepAfterL.toString())
        expect(keepAfterL.gt(keepBL)).equal(true)

        const myInfoFull = await RoyaltyNft.myInfo()
        console.log(
            'TEST STEP 2',
            myInfoFull.map((v) => v.toString())
        )
        const b2 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 2', b2.toString())

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (17e18).toString(), gasLimit: 2000000 }
            )
        ).wait()

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (27e18).toString(), gasLimit: 2000000 }
            )
        ).wait()

        const b3 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 3', b3.toString())

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(5)
        expect(myInfoFullEND[1].toNumber()).greaterThan(10000)

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (1e18).toString() }
            )
        ).wait()

        const keepB = await Zep.balanceOf(Keeper.address)
        await (await Keeper.withdraw()).wait()
        const keepAfter = await Zep.balanceOf(Keeper.address)
        console.log('bals', keepB.toString(), keepAfter.toString())
        expect(keepAfter.lt(keepB)).equal(true)

        const b4 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 4', b4.toString())

        const myInfoFullENDd = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH FINISH',
            myInfoFullENDd.map((v) => v.toString())
        )

        expect(myInfoFullENDd[0].toNumber()).equal(0)
        expect(myInfoFullENDd[1].toNumber()).equal(1)
    })

    it('Should not be able to levelUP and rankUp (MAX) then devolve when withdraw (then buyAgain, level and rank correctly, withdaw again-> become Recruit)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts(1)

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        // swap = mint new royalty
        await buy(owner, 3e18)

        const myInfoFullStart = await RoyaltyNft.myInfo()
        console.log(
            'DICTIONARY rank, level, blocksLeftToRankEvolve,\n' +
                '        possibleClaimAmount, blocksLeftToClaim,\n' +
                '         buyVolumeEth, sellVolumeEth, claimedRewards'
        )
        console.log(
            'TEST START',
            myInfoFullStart.map((v) => v.toString())
        )

        await evolve()

        const myInfoFull = await RoyaltyNft.myInfo()
        console.log(
            'TEST STEP 2',
            myInfoFull.map((v) => v.toString())
        )
        const b2 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 2', b2.toString())

        await buy(owner, 17e18)
        await buy(owner, 27e18)

        const b3 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 3', b3.toString())

        await evolve()
        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(5)
        expect(myInfoFullEND[1].toNumber()).greaterThan(10000)

        // withdraw
        const keepB = await Zep.balanceOf(Keeper.address)
        await (await Keeper.withdraw()).wait()
        const keepAfter = await Zep.balanceOf(Keeper.address)
        console.log('bals', keepB.toString(), keepAfter.toString())
        expect(keepAfter.lt(keepB)).equal(true)

        let failed = false
        try {
            await evolve()
        } catch (e) {
            failed = true
        } finally {
            console.log('Failed', failed)
            expect(failed).to.be.true
        }

        const myInfoFullENDd = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH FINISH',
            myInfoFullENDd.map((v) => v.toString())
        )

        expect(myInfoFullENDd[0].toNumber()).equal(0)
        expect(myInfoFullENDd[1].toNumber()).equal(1)

        // REBUY
        await buy(owner, 27e18)

        await evolve()

        const myInfoRebuy = await RoyaltyNft.myInfo()
        console.log(
            'TEST REBUY',
            myInfoRebuy.map((v) => v.toString())
        )

        expect(myInfoRebuy[0].toNumber()).equal(4)
        expect(myInfoRebuy[1].toNumber()).greaterThan(7000)
        expect(myInfoRebuy[1].toNumber()).lessThan(9600)

        // SELL AGAIN
        const keepB2 = await Zep.balanceOf(Keeper.address)
        await (await Keeper.withdraw()).wait()
        const keepAfter2 = await Zep.balanceOf(Keeper.address)
        console.log('bals(2)', keepB2.toString(), keepAfter2.toString())
        expect(keepAfter2.lt(keepB2)).equal(true)

        const myInfoAfterSecondSell = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH AFTER SECOND SELL',
            myInfoAfterSecondSell.map((v) => v.toString())
        )

        expect(myInfoAfterSecondSell[0].toNumber()).equal(0)
        expect(myInfoAfterSecondSell[1].toNumber()).equal(1)

        // buy again
        await buy(owner, 3e18)

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft({ gasLimit: 20000000 })).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        await generateVolume(1)

        const royalBalance2 = await Zep.balanceOf(RoyaltyNft.address)
        console.log(
            'BALANCE DISTRIBUTE BEFORE (SECOND)',
            royalBalance2.toString()
        )
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter2 = await Zep.balanceOf(RoyaltyNft.address)
        console.log(
            'BALANCE DISTRIBUTE AFTER (SECOND)',
            royalBalanceAfter2.toString()
        )

        expect(
            new BigNumber(royalBalanceAfter2.toString()).isGreaterThan(
                royalBalance2.toString()
            )
        ).is.true
        console.log('TEST_CLAIM_FAIL')

        // SHOULD FAIL CLAIM
        const myBalanceB4NADA = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE NADA', myBalanceB4NADA.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalanceNADA = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER NADA', myBalanceNADA.toString())

        expect(myBalanceB4NADA.sub(myBalanceNADA)).equal(0)

        const myInfoAfterSecondSellCLAIM = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH AFTER SECOND SELL --> & CLAIM',
            myInfoAfterSecondSellCLAIM.map((v) => v.toString())
        )
        expect(myInfoAfterSecondSellCLAIM[0].toNumber()).equal(0)
        expect(myInfoAfterSecondSellCLAIM[1].toNumber()).equal(1001)

        await buy(owner, 27e18)

        // SHOULD FAIL
        const myBalanceB4NADAAgain = await Zep.balanceOf(owner.address)
        console.log(
            'BALANCE CLAIM BEFORE NADA AGAIN',
            myBalanceB4NADAAgain.toString()
        )
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalanceNADAAgain = await Zep.balanceOf(owner.address)
        console.log(
            'BALANCE CLAIM AFTER NADA AGAIN',
            myBalanceNADAAgain.toString()
        )

        expect(myBalanceB4NADAAgain.eq(myBalanceNADAAgain)).is.true

        await evolve()

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true
    })

    it('Should not rankUp when not enough difference (sold)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        await increasePrice()

        // swap = mint new royalty
        await buy(owner, 3e18)

        const myInfoFullStart = await RoyaltyNft.myInfo()
        console.log(
            'DICTIONARY rank, level,\n' +
                '        possibleClaimAmount, blocksLeftToClaim,\n' +
                '         buyVolumeEth, sellVolumeEth,lastEvolve, claimedRewards'
        )
        console.log(
            'TEST START',
            myInfoFullStart.map((v) => v.toString())
        )

        await buy(owner, 15e18)

        const b3 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 3', b3.toString())

        // Sell everything
        await sell()

        const b4 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 4', b4.toString())

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(0)
    })

    it('Should not be able to claim royalty rewards on level 0 (mint, levelUp max, sell everything -> call claim)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        await mintFromSnapshot()
        await createInitialZenAccounts()

        const mintPrice = await RoyaltyNft.getMintPriceEth()

        console.log('mintPrice ----> ', mintPrice.toString())

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (2e17).toString(), gasLimit: 2000000 }
            )
        ).wait()

        const b2 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 2', b2.toString())

        const myInfoFullStart = await RoyaltyNft.myInfo()
        console.log(
            'DICTIONARY rank, level,\n' +
                '        possibleClaimAmount, blocksLeftToClaim,\n' +
                '         buyVolumeEth, sellVolumeEth,lastEvolve, claimedRewards'
        )
        console.log(
            'TEST START',
            myInfoFullStart.map((v) => v.toString())
        )

        await buy(owner, 17e18)
        await buy(owner, 17e18)

        const b4 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 4', b4.toString())

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(5)
        expect(myInfoFullEND[1].toNumber()).greaterThan(10000)

        await sell()

        const b5 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance b4 claim', b5.toString())

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())
    })

    it('Should be able to sell everything and AutoCompounder receives 7%', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts(9)

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        await increasePrice()

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (3e18).toString(), gasLimit: 2000000 }
            )
        ).wait()

        const bA = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance after', bA.toString())
        expect(bA.toNumber()).to.eql(1)

        const myInfoFullStart = await RoyaltyNft.myInfo()
        console.log(
            'DICTIONARY rank, level, blocksLeftToRankEvolve,\n' +
                '        possibleClaimAmount, blocksLeftToClaim,\n' +
                '         buyVolumeEth, sellVolumeEth, claimedRewards'
        )
        console.log(
            'TEST START',
            myInfoFullStart.map((v) => v.toString())
        )

        await evolve()

        const myInfoFull = await RoyaltyNft.myInfo()
        console.log(
            'TEST STEP 2',
            myInfoFull.map((v) => v.toString())
        )
        const b2 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 2', b2.toString())

        await buy(owner, 17e18)
        await buy(owner, 27e18)

        const b3 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 3', b3.toString())

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(5)
        expect(myInfoFullEND[1].toNumber()).greaterThan(10000)

        await buy(owner, 1e18)

        const ZepBAutoLock = await Zep.balanceOf(AutoCompounder.address)

        await sell()

        await withdraw()

        const b4 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 4', b4.toString())

        const myInfoFullENDd = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH FINISH',
            myInfoFullENDd.map((v) => v.toString())
        )

        expect(myInfoFullENDd[0].toNumber()).equal(0)
        expect(myInfoFullENDd[1].toNumber()).equal(1)

        const ZepBAutoLockAfter = await Zep.balanceOf(AutoCompounder.address)

        console.log('>Balance autolock BEFORE: ', ZepBAutoLock.toString())
        console.log('>Balance autolock AFTER: ', ZepBAutoLockAfter.toString())
        expect(
            new BigNumber(ZepBAutoLockAfter.toString()).isGreaterThan(
                ZepBAutoLock.toString()
            )
        ).is.true
    })

    it('Should be able to claim royalty rewards on level 1 (claim)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        await mintFromSnapshot()
        await createInitialZenAccounts(1)

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        await generateVolume(24)

        // TODO: min price not correct ? Mint
        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (2.4e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(1)

        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true
    })

    it('Should NOT be able to burn royalty', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        await mintFromSnapshot()
        await createInitialZenAccounts(1)

        await generateVolume(24)

        // TODO: min price not correct ? Mint
        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (2.5e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(1)

        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true

        const myId = await RoyaltyNft.getIdForAccount(owner.address)
        let fail = false
        try {
            RoyaltyNft.burn(myId)
        } catch (e) {
            console.error(e)
            fail = true
        }
        expect(fail).to.be.true
    })

    it('Should be able to claim royalty rewards on level 4 (with reduced tax)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts()

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        await increasePrice()

        await generateVolume(2)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (10e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (16e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(4)
        // expect(myInfoFullEND[1].toNumber()).equal(1);

        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true
    })

    // -------------------> ROYAL
    it('Should be able to evolve to TheKing (500eth swap, lvlUp, royalEvolve, claim, sell everything, claim again -> throw)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()

        await mintFromSnapshot()
        await createInitialZenAccounts()

        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        // swap = mint new royalty
        await makeBuys(60)

        await levelUpRoyalties(2)

        const sup = await RoyaltyNft.totalSupply()
        console.log('Debel 600 x2', sup.toString())
        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(5)
        // expect(myInfoFullEND[1].toNumber()).equal(1);

        let mustBeRecruit = false
        try {
            await royalEvolve()
        } catch (err) {
            mustBeRecruit = true
        }
        expect(mustBeRecruit).to.be.true

        const myInfoFullNotKing = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH NOT KING',
            myInfoFullNotKing.map((v) => v.toString())
        )

        expect(myInfoFullNotKing[0].toNumber()).equal(5)

        await withdraw()
        await makeBuys(60)
        await royalEvolve(0)

        expect(mustBeRecruit).to.be.true

        const myInfoFullKing = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH KING',
            myInfoFullKing.map((v) => v.toString())
        )

        expect(myInfoFullKing[0].toNumber()).equal(7)
        expect(myInfoFullKing[1].toNumber()).greaterThan(10000)

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true

        // SELL
        await sell()

        await withdraw()

        const my2BalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE 2 ', my2BalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const my2Balance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER 2', my2Balance.toString())

        expect(my2BalanceB4.eq(my2Balance)).is.true
    })

    it('Should be able to evolve a King and a royal (not 2nd king) (500eth swap x2, lvlUp, royalEvolve, claim, sell everything, claim again)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        await increasePrice()

        await generateVolume(2)

        // swap = mint new royalty
        await makeBuys(60)
        console.log('Debel 600 x2')

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(0)
        // expect(myInfoFullEND[1].toNumber()).equal(1);

        await royalEvolve(1)
        console.log('second king')
        await royalEvolve(0, addr1)

        const myInfoFullKing = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH KING',
            myInfoFullKing.map((v) => v.toString())
        )

        const myInfoFullRoyal = await RoyaltyNft.connect(addr1).myInfo()
        console.log(
            'TEST FINISH Royal',
            myInfoFullRoyal.map((v) => v.toString())
        )

        expect(myInfoFullKing[0].toNumber()).equal(6)
        expect(myInfoFullRoyal[0].toNumber()).equal(7)

        // TODO: is this finished ?
    })

    // PURGE
    it('Should be able to purgeRoyal (500eth swap x2, lvlUp, royalEvolve, claim, sell everything, claim again)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        PAIR_ADDRESS_V2 = await Zep.getPairAddress()
        console.log('<<PAIR address>>', PAIR_ADDRESS_V2)
        PairContractV2 = new ethers.Contract(
            PAIR_ADDRESS_V2,
            uniswapPairAbi,
            owner
        )

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        await mintFromSnapshot()
        await createInitialZenAccounts(1)

        const [res, resS] = await PairContractV2.getReserves()
        console.log(
            'RESSSS (init)',
            res.toString(),
            resS.toString(),
            resS / res
        )

        await generateVolume(2)
        const bb = await Zep.balanceOf(owner.address)
        console.log('<b- before', bb.toString())
        const [res1, res2] = await PairContractV2.getReserves()
        console.log('RESSSS', res1.toString(), res2.toString(), res2 / res1)

        // KING & ROYAL
        await makeBuys(51)
        console.log('Debel 600 x2')
        const bb2 = await Zep.balanceOf(owner.address)
        console.log('<b- after', bb2.toString())
        const [res11, res22] = await PairContractV2.getReserves()
        console.log(
            'RESSSS (2)',
            res11.toString(),
            res22.toString(),
            res22 / res11
        )
        console.log('seee')
        await makeBuys(50, 1e19, addr1)
        const [res111, res222] = await PairContractV2.getReserves()
        console.log(
            'RESSSS (3)',
            res111.toString(),
            res222.toString(),
            res222 / res111
        )

        const kingInfo = await RoyaltyNft.myInfo()
        const royalInfo = await RoyaltyNft.connect(addr1).myInfo()
        console.log(
            'TEST FINISH king',
            kingInfo.map((v) => v.toString())
        )
        console.log(
            'TEST FINISH royal',
            royalInfo.map((v) => v.toString())
        )

        expect(kingInfo[0].toNumber()).equal(0)
        expect(royalInfo[0].toNumber()).equal(0)

        await royalEvolve(0)
        console.log('second king')
        await royalEvolve(1, addr1)

        const myInfoFullKing = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH KING',
            myInfoFullKing.map((v) => v.toString())
        )

        const myInfoFullRoyal = await RoyaltyNft.connect(addr1).myInfo()
        console.log(
            'TEST FINISH Royal',
            myInfoFullRoyal.map((v) => v.toString())
        )

        expect(myInfoFullKing[0].toNumber()).equal(7)
        expect(myInfoFullRoyal[0].toNumber()).equal(6)

        const [supremeBefore, mungBefore] =
            await RoyaltyNft.getSupremeAndMungularities()
        console.log('SUPREME', supremeBefore, mungBefore)

        expect(supremeBefore).equal(owner.address)
        const containsBefore = mungBefore.some(
            (s) => s.toLowerCase() === addr1.address.toLowerCase()
        )
        expect(containsBefore).to.be.true

        // sell
        await sell(owner)

        const ZepAfter = await Zep.balanceOf(owner.address)
        console.log('::: SOLD after (king)', ZepAfter.toString())
        // expect(kingZepToSell.eq(ZepAfter)).to.be.true;
        await withdraw()

        // SELL ROYAL
        let failRoyal = false
        try {
            console.log('Sell nothing')
            await sell(addr1, 3)
        } catch (err) {
            failRoyal = true
            console.error(err)
        }
        expect(failRoyal).to.be.true

        await withdraw(addr1)
        await sell(addr1, 3)

        const royalZepAfter = await Zep.balanceOf(addr1.address)
        console.log('::: SOLD after (royal)', royalZepAfter.toString())

        // await (await RoyaltyNft.purgeRoyal()).wait();

        const [supreme, mung] = await RoyaltyNft.getSupremeAndMungularities()
        console.log('SUPREME after SELL', supreme, mung)
        expect(supreme).equal('0x0000000000000000000000000000000000000000')
        const contains = mung.every(
            (s) => s.toLowerCase() !== addr1.address.toLowerCase()
        )
        expect(contains).to.be.true
        // 7 + 5
        const signers = [
            addr2,
            addrR1,
            addrR2,
            addrR3,
            addrR4,
            addrR5,
            manyAddrs[0],
            manyAddrs[1],
            manyAddrs[2],
            manyAddrs[3],
            manyAddrs[4],
            manyAddrs[5],
        ]

        const promise = signers.reduce((chain, sign, i) => {
            return chain.then(async () => {
                console.log('DONE WHAT DA')
                await makeBuys(20, 1e19, sign)

                const royalInfo = await RoyaltyNft.connect(sign).myInfo()
                console.log(
                    'TEST FINISH (i) royal',
                    i,
                    royalInfo.map((v) => v.toString())
                )
                expect(kingInfo[0].toNumber()).equal(0)

                await royalEvolve(1, sign)

                const royalInfoAfter = await RoyaltyNft.connect(sign).myInfo()
                console.log(
                    'TEST FINISH (i) AFTER royal',
                    i,
                    royalInfoAfter.map((v) => v.toString())
                )
                expect(royalInfoAfter[0].toNumber()).equal(6)
            })
        }, Promise.resolve())

        console.log('PRR', promise)
        await promise

        const [supreme2, mung2] = await RoyaltyNft.getSupremeAndMungularities()
        console.log('SUPREME2 after SELL', supreme2, mung2)
        expect(supreme2).equal('0x0000000000000000000000000000000000000000')
        const containsNOzero = mung2.every(
            (s) =>
                s.toLowerCase() !==
                '0x0000000000000000000000000000000000000000'.toLowerCase()
        )
        expect(containsNOzero).to.be.true

        // NEW supreme
        await makeBuys(52, 1e19)
        await royalEvolve(0)

        const [supreme2pls, mung2pls] =
            await RoyaltyNft.getSupremeAndMungularities()
        console.log('SUPREME2 pls after SELL', supreme2pls, mung2pls)
        expect(supreme2pls).equal(owner.address)
        // SHOULD FAIL
        await makeBuys(20, 1e19, manyAddrs[1])

        const royalInfoFailing = await RoyaltyNft.connect(manyAddrs[1]).myInfo()
        console.log(
            'TEST FINISH (FAIL) royal',
            royalInfoFailing.map((v) => v.toString())
        )
        expect(kingInfo[0].toNumber()).equal(0)

        let failed = false
        try {
            await royalEvolve(-1, manyAddrs[1])
        } catch (e) {
            console.error(e)
            failed = true
        }
        expect(failed).to.be.true

        // SELL LAST (since everything goes for mung)
        let failed2 = false
        try {
            await sell(addrR3, 3, 2)
        } catch (e) {
            console.error(e)
            failed2 = true
        }
        expect(failed2).to.be.true

        const royalZepAfter2 = await Zep.balanceOf(addrR3.address)
        console.log('::: SOLD after (last)', royalZepAfter2.toString())
        expect(royalZepAfter2.eq(0)).to.be.true

        // sendRoyaltyRewardsToNft
        const royalBalance1 = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE (1)', royalBalance1.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter1 = await Zep.balanceOf(RoyaltyNft.address)
        console.log(
            'BALANCE DISTRIBUTE AFTER (1)',
            royalBalanceAfter1.toString()
        )

        expect(
            new BigNumber(royalBalanceAfter1.toString()).isGreaterThan(
                royalBalance1.toString()
            )
        ).is.true

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (
            await RoyaltyNft.connect(addrR3).claim({ gasPrice: 5000000000 })
        ).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        await withdraw(addrR3)

        expect(myBalance.eq(myBalanceB4)).is.true

        const [supremeLast, mungLast] =
            await RoyaltyNft.getSupremeAndMungularities()
        console.log('SUPREME (last) after SELL', supremeLast, mungLast)
        expect(supremeLast).equal(owner.address)
        const containsLast = mungLast.every(
            (s) => s.toLowerCase() !== addrR3.address.toLowerCase()
        )
        expect(containsLast).to.be.true

        const containsLastForReal =
            mungLast.filter(
                (s) =>
                    s.toLowerCase() ===
                    '0x0000000000000000000000000000000000000000'.toLowerCase()
            ).length == 1
        expect(containsLastForReal).to.be.true
    })

    // TRANSFER OWNERSHIP
    it('Should be able to transfer ownership (levelUp and claim then transfer then levelUp and claim again', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts()

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        await increasePrice()

        // sendRoyaltyRewardsToNft
        const royalBalance1 = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE (1)', royalBalance1.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter1 = await Zep.balanceOf(RoyaltyNft.address)
        console.log(
            'BALANCE DISTRIBUTE AFTER (1)',
            royalBalanceAfter1.toString()
        )

        expect(
            new BigNumber(royalBalanceAfter1.toString()).isGreaterThan(
                royalBalance1.toString()
            )
        ).is.true

        await generateVolume(2)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (10e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (16e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(4)
        // expect(myInfoFullEND[1].toNumber()).equal(1);

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true

        const owB = await RoyaltyNft.balanceOf(owner.address)
        const addr2B = await RoyaltyNft.balanceOf(addr2.address)
        console.log('>TBalance before', owB.toString(), addr2B.toString())
        expect(owB.toNumber()).equal(1)
        expect(addr2B.toNumber()).equal(0)

        const myId = await RoyaltyNft.getIdForAccount(owner.address)
        await (await RoyaltyNft.approve(addr2.address, myId)).wait()
        console.log('Approve passed !')
        // await (await RoyaltyNft.safeTransferFrom(owner.address, addr2.address, myId.toString())).wait();
        await (
            await RoyaltyNft['safeTransferFrom(address,address,uint256)'](
                owner.address,
                addr2.address,
                myId.toString()
            )
        ).wait()

        const owB2 = await RoyaltyNft.balanceOf(owner.address)
        const addr2B2 = await RoyaltyNft.balanceOf(addr2.address)
        console.log('>TBalance after', owB2.toString(), addr2B2.toString())
        expect(owB2.toNumber()).equal(0)
        expect(addr2B2.toNumber()).equal(1)

        const ownerOfId = await RoyaltyNft.ownerOf(myId)
        console.log('New owner', ownerOfId.toString())
        console.log('Exepecting', addr2B2.toString())
        expect(addr2.address.toString()).equal(ownerOfId.toString())
        console.log('Should Not be old owner', owner.address)
        expect(ownerOfId.toString()).to.not.equal(owner.address)
        const myNewId = await RoyaltyNft.getIdForAccount(addr2.address)
        console.log(
            'Transfered id, new id',
            myId.toString(),
            myNewId.toString()
        )
        expect(myNewId.toString()).equal(myId.toString())

        await (
            await UniRouterContract.connect(
                addr2
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addr2.address,
                1856678133,
                { value: (16e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        // sendRoyaltyRewardsToNft
        const royalBalance2 = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE (2)', royalBalance2.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter2 = await Zep.balanceOf(RoyaltyNft.address)
        console.log(
            'BALANCE DISTRIBUTE AFTER (2)',
            royalBalanceAfter2.toString()
        )

        expect(
            new BigNumber(royalBalanceAfter2.toString()).isGreaterThan(
                royalBalance2.toString()
            )
        ).is.true

        console.log('Gonna LVL up !')
        await evolve(addr2)

        const myInfoFullEND2 = await RoyaltyNft.connect(addr2).myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND2.map((v) => v.toString())
        )

        expect(myInfoFullEND2[0].toNumber()).equal(5)
        // expect(myInfoFullEND[1].toNumber()).equal(1);

        const myBalanceB42 = await Zep.balanceOf(addr2.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB42.toString())
        await (
            await RoyaltyNft.connect(addr2).claim({ gasPrice: 5000000000 })
        ).wait()
        const myBalance2 = await Zep.balanceOf(addr2.address)
        console.log('BALANCE CLAIM AFTER ', myBalance2.toString())

        expect(
            new BigNumber(myBalance2.toString()).isGreaterThan(
                myBalanceB42.toString()
            )
        ).is.true
    })

    it('Should be able to distribute the initial Zep balances', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        await mintFromSnapshot()
    })

    it('Should be able to distribute initial 500 Zen Spots ', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        await mintFromSnapshot()
        await createInitialZenAccounts()
    })

    it('Should be able to sell and lock lp', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts(1)

        // migrate
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        // await generateVolume(1);

        // console.log("GIMME !");
        // // BUY > 10 ETH
        // await (await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
        //     0,
        //     [WETH_ADDRESS1, Zep.address],
        //     owner.address,
        //     1856678133,
        //     { value: 18.2e18.toString(), gasLimit: 35000000 }
        // )).wait();

        await buy(owner, 100e18)

        await sell()

        const balanceOfAutoLocker = await Zep.balanceOf(AutoCompounder.address)

        console.log(balanceOfAutoLocker, '<-- Bal To Compound')

        await AutoCompounder.autoLockLPFull()

        const balanceOfAutoLockerAfter = await Zep.balanceOf(
            AutoCompounder.address
        )
        console.log(balanceOfAutoLockerAfter, 'Bal AFTER AutoCompounder Tokens')

        // const balanceOfLpInAutoLocker = await PairContractV2.balanceOf(AutoCompounder.address);
        // console.log(balanceOfLpInAutoLocker, "Bal LP TOKENS AFTER AutoCompounder");
        // await generateVolume(6);

        // await (await ZenNft.evolve()).wait();

        // const myInfo = await ZenNft.myInfo();
        // console.log("TEST FINISH", myInfo.map((v) => v.toString()));

        // expect(myInfo[0].toNumber()).equal(0);

        // const ZepB = await Zep.balanceOf(owner.address);
        // console.log("ZEPB", ZepB.toString());

        // // 300k
        // await (await ZenNft.speedUpEvolution("300000000000000000000000")).wait();

        // await (await ZenNft.evolve()).wait();

        // const myInfo2 = await ZenNft.myInfo();
        // console.log("TEST FINISH", myInfo2.map((v) => v.toString()));
        // expect(myInfo2[0].toNumber()).equal(1);

        // const speedstaB = await MilesNft.balanceOf(owner.address);
        // console.log("speedsta balance", speedstaB.toString());
        // expect(speedstaB.toNumber()).equal(1);
    })

    it('Should be able to mint royalty NFT when first with min amount (exact mint amount, exact level up amount)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()

        await mintFromSnapshot()
        await createInitialZenAccounts()

        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        await generateVolume(24)

        // swap = mint new royalty
        await buy(owner, 200700000000000000) // 0.2007

        const owB = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance', owB.toString(), owB.toString())
        expect(owB.toNumber()).equal(1)

        const myInfoFullBefore = await RoyaltyNft.myInfo()

        await buy(owner, 3e15)

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString()),
            myInfoFullBefore.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(0)
        expect(myInfoFullEND[1].toNumber()).greaterThan(
            myInfoFullBefore[1].toNumber()
        )
        expect(myInfoFullEND[1].toNumber()).equal(67)

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        // Rank1
        await buy(owner, 2.2e18)

        await evolve()

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true
    })

    // Not pasmung, not important
    it.skip('Should be able to mint royalty NFT after 1000', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        await increasePrice()
        await generateVolume(24)

        await mintRoyalties(1)

        const owBefore = await RoyaltyNft.balanceOf(owner.address)
        const ts = await RoyaltyNft.totalSupply()
        console.log(
            '>Balance before no',
            owBefore.toString(),
            owBefore.toString(),
            ts.toString()
        )
        expect(owBefore.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (2e17).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after no', owB.toString(), owB.toString())
        expect(owB.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (8.9e17).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB2 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after 2no', owB2.toString(), owB2.toString())
        expect(owB2.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (9003e14).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owAfter = await RoyaltyNft.balanceOf(owner.address)
        console.log(
            '>LBalance after YES',
            owAfter.toString(),
            owAfter.toString()
        )
        expect(owAfter.toNumber()).equal(1)

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (4e15).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(1)

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true
    })

    it('Should be able to scale royalty NFT price in each phase', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        // await increasePrice();
        // await generateVolume(20);
        await mintFromSnapshot()
        await createInitialZenAccounts()

        // ===============================================> PHASE 1
        await mintRoyalties(1)

        const owBefore = await RoyaltyNft.balanceOf(owner.address)
        console.log(
            '>Balance before no',
            owBefore.toString(),
            owBefore.toString()
        )
        expect(owBefore.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (9.1e17).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after no', owB.toString(), owB.toString())
        expect(owB.toNumber()).equal(1)

        // ===============================================> PHASE 2
        await mintRoyalties(1, 1)

        const owBefore2 = await RoyaltyNft.balanceOf(addrR1.address)
        console.log(
            '>Balance 2 before no',
            owBefore2.toString(),
            owBefore2.toString()
        )
        expect(owBefore2.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.connect(
                addrR1
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR1.address,
                1856678133,
                { value: (1.91e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB22 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance 2 after no', owB22.toString(), owB22.toString())
        expect(owB22.toNumber()).equal(1)

        // ===============================================> PHASE 3
        await mintRoyalties(1, 2)
        const owBefore3 = await RoyaltyNft.balanceOf(addrR2.address)
        console.log(
            '>Balance 3 before no',
            owBefore3.toString(),
            owBefore3.toString()
        )
        expect(owBefore3.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.connect(
                addrR2
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR2.address,
                1856678133,
                { value: (6e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB3 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance 3 after no', owB3.toString(), owB3.toString())
        expect(owB3.toNumber()).equal(1)
        // // ===============================================> PHASE 4
        await mintRoyalties(1, 3)
        const owBefore4 = await RoyaltyNft.balanceOf(addrR3.address)
        console.log(
            '>Balance 4 before no',
            owBefore4.toString(),
            owBefore4.toString()
        )
        expect(owBefore4.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.connect(
                addrR3
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR3.address,
                1856678133,
                { value: (20e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB4 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance 4 after no', owB4.toString(), owB4.toString())
        expect(owB4.toNumber()).equal(1)

        // // ===============================================> PHASE 5
        await mintRoyalties(1, 4)
        const owBefore5 = await RoyaltyNft.balanceOf(addrR4.address)
        console.log(
            '>Balance 5 before no',
            owBefore5.toString(),
            owBefore5.toString()
        )
        expect(owBefore5.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.connect(
                addrR4
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR4.address,
                1856678133,
                { value: (50e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB5 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance 5 after no', owB5.toString(), owB5.toString())
        expect(owB5.toNumber()).equal(1)

        // ===============================================> PHASE 6
        await mintRoyalties(1, 5)
        const owBefore6 = await RoyaltyNft.balanceOf(addrR5.address)
        console.log(
            '>Balance 6 before no',
            owBefore6.toString(),
            owBefore6.toString()
        )
        expect(owBefore6.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.connect(
                addrR5
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR5.address,
                1856678133,
                { value: (600e17).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB6 = await RoyaltyNft.balanceOf(addrR5.address)
        console.log('>LBalance 6 after no', owB6.toString(), owB6.toString())
        expect(owB6.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: '800000000000000000000', gasLimit: 35000000 }
            )
        ).wait()

        const owB2 = await RoyaltyNft.balanceOf(addrR5.address)
        console.log('>LBalance after 2no', owB2.toString(), owB2.toString())
        expect(owB2.toNumber()).equal(0)
    })

    it('Should not be able to mint royalty NFT after 3000', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        // await increasePrice();
        // await generateVolume(20);
        await mintFromSnapshot()
        await createInitialZenAccounts()

        await mintRoyalties(6)

        const owBefore = await RoyaltyNft.balanceOf(owner.address)
        console.log(
            '>Balance before no',
            owBefore.toString(),
            owBefore.toString()
        )
        expect(owBefore.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (600e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after no', owB.toString(), owB.toString())
        expect(owB.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: '800000000000000000000', gasLimit: 35000000 }
            )
        ).wait()

        const owB2 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after 2no', owB2.toString(), owB2.toString())
        expect(owB2.toNumber()).equal(0)
    })

    it('Should be able to distibuteRewards and transfer after everything (500, 3000)', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        const zenBalanceB4M = await ZenNft.balanceOf(addr2.address)
        console.log('ZEN BALANCE B4 migrate 1st', zenBalanceB4M.toString())

        const zenBalanceB4AcutalM = await ZenNft.balanceOf(addr2.address)
        console.log(
            'ZEN BALANCE B4 after createZens',
            zenBalanceB4AcutalM.toString()
        )

        const sup = await ZenNft.totalSupply()
        console.log('_sup_', sup.toString())

        // migrate
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        await (
            await Zep.testBuy([owner.address], '100000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()
        await (
            await Zep.testBuy([owner.address], '100000000000000000', {
                value: '200000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()
        await mintFromSnapshot()
        await createInitialZenAccounts()

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())
        await (
            await Zep.testBuyAfter([owner.address], '100000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()
        await (
            await Zep.testBuy([owner.address], '100000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()

        const am = await RoyaltyNft.balanceOf(owner.address)
        expect(am.toNumber()).equal(0)
        await mintRoyalties(6)
        console.log('OOOOOOGGGGGG')
        await (
            await Zep.testBuy([owner.address], '100000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()
        await (
            await Zep.testBuy([owner.address], '100000000000000000000', {
                value: '200000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()

        const owBefore = await RoyaltyNft.balanceOf(owner.address)
        console.log(
            '>Balance before no',
            owBefore.toString(),
            owBefore.toString()
        )
        expect(owBefore.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (600e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after no', owB.toString(), owB.toString())
        expect(owB.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: '1000000000000000000000', gasLimit: 35000000 }
            )
        ).wait()

        const owB2 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after 2no', owB2.toString(), owB2.toString())
        expect(owB2.toNumber()).equal(0)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: '1200000000000000000000', gasLimit: 35000000 }
            )
        ).wait()

        const owAfter = await RoyaltyNft.balanceOf(owner.address)
        console.log(
            '>LBalance after YES',
            owAfter.toString(),
            owAfter.toString()
        )
        expect(owAfter.toNumber()).equal(0)

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        const zenBalance = await Zep.balanceOf(ZenNft.address)
        console.log('BALANCE DISTRIBUTE ZEN BEFORE ', zenBalance.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenBalanceAfter = await Zep.balanceOf(ZenNft.address)
        console.log('BALANCE DISTRIBUTE ZEN AFTER ', zenBalanceAfter.toString())

        expect(
            new BigNumber(zenBalanceAfter.toString()).isGreaterThan(
                zenBalance.toString()
            )
        ).is.true
    })

    it('Should be able to levelUp distibuteRewards and claim after some mint (500, 3000)', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        const zenBalanceB4M = await ZenNft.balanceOf(addr2.address)
        console.log('ZEN BALANCE B4 migrate 1st', zenBalanceB4M.toString())

        const zenBalanceB4AcutalM = await ZenNft.balanceOf(addr2.address)
        console.log(
            'ZEN BALANCE B4 after createZens',
            zenBalanceB4AcutalM.toString()
        )

        const sup = await ZenNft.totalSupply()
        console.log('_sup_', sup.toString())

        // migrate
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        PAIR_ADDRESS_V2 = await Zep.getPairAddress()
        console.log('<<PAIR address>>', PAIR_ADDRESS_V2)
        PairContractV2 = new ethers.Contract(
            PAIR_ADDRESS_V2,
            uniswapPairAbi,
            owner
        )

        await (
            await Zep.testBuy([owner.address], '100000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()
        await mintFromSnapshot()
        await createInitialZenAccounts()

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        await (
            await Zep.testBuy([owner.address], '10000000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()
        const owB23 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after 2no', owB23.toString(), owB23.toString())
        expect(owB23.toNumber()).equal(1)
        await (
            await Zep.testBuyAfter([owner.address], '1000000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()
        await mintRoyalties(6)
        await (
            await Zep.testBuy([owner.address], '100000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()

        await (
            await Zep.testBuyAfter([owner.address], '1000000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(3)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (13.9e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await evolve()

        const myInfoFullEND2 = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND2.map((v) => v.toString())
        )

        expect(myInfoFullEND2[0].toNumber()).equal(4)

        const yBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE DISTRIBUTE BEFORE Zep ', yBalance.toString())

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        const [res1, res2] = await PairContractV2.getReserves()
        console.log('RESSSS', res1, res2, res1 / res2, res2 / res1)

        await generateVolume(24)

        // sendRoyaltyRewardsToNft
        const royalBalance2 = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE (2)', royalBalance2.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter2 = await Zep.balanceOf(RoyaltyNft.address)
        console.log(
            'BALANCE DISTRIBUTE AFTER (2)',
            royalBalanceAfter2.toString()
        )

        expect(
            new BigNumber(royalBalanceAfter2.toString()).isGreaterThan(
                royalBalance2.toString()
            )
        ).is.true

        const zenBalance = await Zep.balanceOf(ZenNft.address)
        console.log('BALANCE DISTRIBUTE ZEN BEFORE ', zenBalance.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenBalanceAfter = await Zep.balanceOf(ZenNft.address)
        console.log('BALANCE DISTRIBUTE ZEN AFTER ', zenBalanceAfter.toString())

        expect(
            new BigNumber(zenBalanceAfter.toString()).isGreaterThan(
                zenBalance.toString()
            )
        ).is.true

        // CLAIM
        const myBalanceB42 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB42.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance2 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance2.toString())

        expect(
            new BigNumber(myBalance2.toString()).isGreaterThan(
                myBalanceB42.toString()
            )
        ).is.true
    })

    it('Should be able to levelUp distibuteRewards and claim after some mint (500, 1)', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        const zenBalanceB4M = await ZenNft.balanceOf(addr2.address)
        console.log('ZEN BALANCE B4 migrate 1st', zenBalanceB4M.toString())

        const zenBalanceB4AcutalM = await ZenNft.balanceOf(addr2.address)
        console.log(
            'ZEN BALANCE B4 after createZens',
            zenBalanceB4AcutalM.toString()
        )

        const sup = await ZenNft.totalSupply()
        console.log('_sup_', sup.toString())

        // migrate
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        PAIR_ADDRESS_V2 = await Zep.getPairAddress()
        console.log('<<PAIR address>>', PAIR_ADDRESS_V2)
        PairContractV2 = new ethers.Contract(
            PAIR_ADDRESS_V2,
            uniswapPairAbi,
            owner
        )

        await (
            await Zep.testBuy([owner.address], '100000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()

        const bothFirst = await PairContractV2.getReserves()
        console.log('RESSSS', bothFirst)
        console.log(
            'RESSSS 2',
            bothFirst[0].toString(),
            bothFirst[1].toString()
        )

        await mintFromSnapshot()
        await createInitialZenAccounts()

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        await (
            await Zep.testBuy([owner.address], '100000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()
        const owB23 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after 2no', owB23.toString(), owB23.toString())
        expect(owB23.toNumber()).equal(0)

        await (
            await Zep.testBuy([owner.address], '6000000000000000000', {
                value: '20000000000000000000',
                gasLimit: 50000000,
            })
        ).wait()

        const owB2 = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after 2no --> (2)', owB2.toString())
        expect(owB2.toNumber()).equal(1)

        await evolve()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(2)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (13.9e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await evolve()

        const myInfoFullEND2 = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND2.map((v) => v.toString())
        )

        expect(myInfoFullEND2[0].toNumber()).equal(3)

        const yBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE DISTRIBUTE BEFORE Zep ', yBalance.toString())

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        const [res1, res2] = await PairContractV2.getReserves()
        console.log('RESSSS', res1.toString(), res2.toString())

        await generateVolume(24)

        // sendRoyaltyRewardsToNft
        const royalBalance2 = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE (2) BEFORE ', royalBalance2.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter2 = await Zep.balanceOf(RoyaltyNft.address)
        console.log(
            'BALANCE DISTRIBUTE (2) AFTER ',
            royalBalanceAfter2.toString()
        )

        expect(
            new BigNumber(royalBalanceAfter2.toString()).isGreaterThan(
                royalBalance2.toString()
            )
        ).is.true

        const zenBalance = await Zep.balanceOf(ZenNft.address)
        console.log('BALANCE DISTRIBUTE ZEN BEFORE ', zenBalance.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenBalanceAfter = await Zep.balanceOf(ZenNft.address)
        console.log('BALANCE DISTRIBUTE ZEN AFTER ', zenBalanceAfter.toString())

        expect(
            new BigNumber(zenBalanceAfter.toString()).isGreaterThan(
                zenBalance.toString()
            )
        ).is.true

        // CLAIM
        const myBalanceB42 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB42.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance2 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance2.toString())

        expect(
            new BigNumber(myBalance2.toString()).isGreaterThan(
                myBalanceB42.toString()
            )
        ).is.true
    })

    // ----------->  ZEN
    it('Should be able to burn 1 Zen Spot', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts(1)

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        await generateVolume(1)

        // BUY > 40 ETH (20m fund)
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const zenBalanceB4 = await ZenNft.balanceOf(owner.address)
        console.log('ZEN BALANCE B4', zenBalanceB4.toString())
        expect(zenBalanceB4.toNumber()).equal(1)

        const zenZepBalance = await Zep.balanceOf(ZenNft.address)
        console.log('BALANCE DISTRIBUTE ZEN BEFORE ', zenZepBalance.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenZepBalanceAfter = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN AFTER ',
            zenZepBalanceAfter.toString()
        )

        expect(
            new BigNumber(zenZepBalanceAfter.toString()).isGreaterThan(
                zenZepBalance.toString()
            )
        ).is.true

        const ZepB4 = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE B4', ZepB4.toString())

        await (await ZenNft.burnToClaim()).wait()

        const zenBalanceAfter = await ZenNft.balanceOf(owner.address)
        console.log('ZEN BALANCE AFTER', zenBalanceAfter.toString())
        expect(zenBalanceAfter.toNumber()).equal(0)

        const ZepAfter = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE AFTER', ZepAfter.toString())

        expect(
            new BigNumber(ZepAfter.toString()).isGreaterThan(ZepB4.toString())
        ).is.true
    })

    it('Should be able to mint 1 Zen Spot after initial 500', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts()

        const zenOwnerB = await ZenNft.balanceOf(owner.address)
        console.log('ZEN OWNER BALANCE AFTER', zenOwnerB.toString())
        expect(zenOwnerB.toNumber()).equal(1)

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        await generateVolume(1)

        const zenZepBalance = await Zep.balanceOf(ZenNft.address)
        console.log('BALANCE DISTRIBUTE ZEN BEFORE ', zenZepBalance.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenZepBalanceAfter = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN AFTER ',
            zenZepBalanceAfter.toString()
        )

        expect(
            new BigNumber(zenZepBalanceAfter.toString()).isGreaterThan(
                zenZepBalance.toString()
            )
        ).is.true

        const ZepB4 = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE B4', ZepB4.toString())

        await (await ZenNft.burnToClaim()).wait()

        const zenBalanceAfter = await ZenNft.balanceOf(owner.address)
        console.log('ZEN BALANCE AFTER', zenBalanceAfter.toString())
        expect(zenBalanceAfter.toNumber()).equal(0)

        const ZepAfter = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE AFTER', ZepAfter.toString())

        expect(
            new BigNumber(ZepAfter.toString()).isGreaterThan(ZepB4.toString())
        ).is.true

        // (REBUY) BUY > 40 ETH (20m fund) --> buys Royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        // BURN ADDRESS
        const burnAddr = await RoyaltyNft.getNextBurnPairAddress()
        const myId = await RoyaltyNft.getIdForAccount(owner.address)
        expect(myId).to.not.equal(0)
        console.log('my id', myId.toNumber(), burnAddr)
        await (await RoyaltyNft.approve(ZenNft.address, myId)).wait()

        // (REBUY) BUY > 40 ETH (20m fund) --> buys Zen
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const zenBalanceB4 = await ZenNft.balanceOf(owner.address)
        console.log('ZEN BALANCE B4', zenBalanceB4.toString())
        expect(zenBalanceB4.toNumber()).equal(1)

        const zenZepBalanceREBUY = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN BEFORE (REBUY)',
            zenZepBalanceREBUY.toString()
        )
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenZepBalanceAfterREBUY = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN AFTER (REBUY)',
            zenZepBalanceAfterREBUY.toString()
        )

        expect(
            new BigNumber(zenZepBalanceAfterREBUY.toString()).isGreaterThan(
                zenZepBalanceREBUY.toString()
            )
        ).is.true

        const ZepB4REBUY = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE B4 (REBUY)', ZepB4REBUY.toString())

        await (await ZenNft.burnToClaim()).wait()

        const zenBalanceAfterREBUY = await ZenNft.balanceOf(owner.address)
        console.log(
            'ZEN BALANCE AFTER (REBUY)',
            zenBalanceAfterREBUY.toString()
        )
        expect(zenBalanceAfterREBUY.toNumber()).equal(0)

        const ZepAfterREBUY = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE AFTER (REBUY)', ZepAfterREBUY.toString())

        expect(
            new BigNumber(ZepAfterREBUY.toString()).isGreaterThan(
                ZepB4REBUY.toString()
            )
        ).is.true

        // (RAND) BUY > 40 ETH (20m fund) --> buys Royalty
        await (
            await UniRouterContract.connect(
                addrR1
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR1.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        // levelUp
        await evolve(addrR1)

        // BURN ADDRESS
        const myIdRand = await RoyaltyNft.getIdForAccount(addrR1.address)
        const myBal = await RoyaltyNft.balanceOf(addrR1.address)
        console.log('my id', myIdRand.toNumber(), myBal.toString())
        expect(myBal.toNumber()).equal(1)
        expect(myIdRand).to.not.equal(0)
        await (
            await RoyaltyNft.connect(addrR1).approve(ZenNft.address, myIdRand)
        ).wait()

        // (FAILS because high level) (RAND BUY > 40 ETH (20m fund) --> buys Zen
        await (
            await UniRouterContract.connect(
                addrR1
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR1.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const zenBalanceB4RANDFail = await ZenNft.balanceOf(addrR1.address)
        console.log(
            'ZEN BALANCE B4 (RAND-fails)',
            zenBalanceB4RANDFail.toString()
        )
        expect(zenBalanceB4RANDFail.toNumber()).equal(0)

        // (Success) (RAND BUY > 40 ETH (20m fund) --> buys Zen
        const ZepBal = await Zep.balanceOf(addrR1.address)
        // SELL
        await withdraw(addrR1)
        //BUY
        await (
            await UniRouterContract.connect(
                addrR1
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR1.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const zenBalanceB4RAND = await ZenNft.balanceOf(addrR1.address)
        console.log('ZEN BALANCE B4 (RAND)', zenBalanceB4RAND.toString())
        expect(zenBalanceB4RAND.toNumber()).equal(1)

        const zenZepBalanceRand = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN BEFORE (RAND)',
            zenZepBalanceRand.toString()
        )
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenZepBalanceAfterRand = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN AFTER (RAND)',
            zenZepBalanceAfterRand.toString()
        )

        expect(
            new BigNumber(zenZepBalanceAfterRand.toString()).isGreaterThan(
                zenZepBalanceRand.toString()
            )
        ).is.true

        const ZepB4Rand = await Zep.balanceOf(addrR1.address)
        console.log('Zep BALANCE B4 (RAND 2)', ZepB4Rand.toString())

        await (await ZenNft.connect(addrR1).burnToClaim()).wait()

        const zenBalanceAfterRand = await ZenNft.balanceOf(addrR1.address)
        console.log('ZEN BALANCE AFTER (RAND)', zenBalanceAfterRand.toString())
        expect(zenBalanceAfterRand.toNumber()).equal(0)

        const ZepAfterRand = await Zep.balanceOf(addrR1.address)
        console.log('Zep BALANCE AFTER (RAND)', ZepAfterRand.toString())

        expect(
            new BigNumber(ZepAfterRand.toString()).isGreaterThan(
                ZepB4Rand.toString()
            )
        ).is.true
    })

    it('Should be able to mint 1 Zen Spot after initial 500 and after 2980 minted', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts()

        const zenOwnerB = await ZenNft.balanceOf(owner.address)
        console.log('ZEN OWNER BALANCE AFTER', zenOwnerB.toString())
        expect(zenOwnerB.toNumber()).equal(1)

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        PAIR_ADDRESS_V2 = await Zep.getPairAddress()
        console.log('<<PAIR address>>', PAIR_ADDRESS_V2)
        PairContractV2 = new ethers.Contract(
            PAIR_ADDRESS_V2,
            uniswapPairAbi,
            owner
        )

        // ROYALTIES
        await mintRoyalties(5)

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        await generateVolume(1)

        const zenZepBalance = await Zep.balanceOf(ZenNft.address)
        console.log('BALANCE DISTRIBUTE ZEN BEFORE ', zenZepBalance.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenZepBalanceAfter = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN AFTER ',
            zenZepBalanceAfter.toString()
        )

        expect(
            new BigNumber(zenZepBalanceAfter.toString()).isGreaterThan(
                zenZepBalance.toString()
            )
        ).is.true

        const [res1, res2] = await PairContractV2.getReserves()
        console.log('RESSSS', res1, res2, res1 / res2, res2 / res1)

        const ZepB4 = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE B4', ZepB4.toString())

        await (await ZenNft.burnToClaim()).wait()

        const zenBalanceAfter = await ZenNft.balanceOf(owner.address)
        console.log('ZEN BALANCE AFTER', zenBalanceAfter.toString())
        expect(zenBalanceAfter.toNumber()).equal(0)

        const ZepAfter = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE AFTER', ZepAfter.toString())

        expect(
            new BigNumber(ZepAfter.toString()).isGreaterThan(ZepB4.toString())
        ).is.true

        // (REBUY) BUY > 40 ETH (20m fund) --> buys Royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (77.5e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        // BURN ADDRESS
        const myBal = await RoyaltyNft.balanceOf(owner.address)
        const myId = await RoyaltyNft.getIdForAccount(owner.address)
        console.log('my id', myId.toNumber(), myBal.toString())
        expect(myId).to.not.equal(0)
        expect(myBal.toNumber()).equal(1)

        await (await RoyaltyNft.approve(ZenNft.address, myId)).wait()

        // (REBUY) BUY > 40 ETH (20m fund) --> buys Zen
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const zenBalanceB4 = await ZenNft.balanceOf(owner.address)
        console.log('ZEN BALANCE B4', zenBalanceB4.toString())
        expect(zenBalanceB4.toNumber()).equal(1)

        const zenZepBalanceREBUY = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN BEFORE (REBUY)',
            zenZepBalanceREBUY.toString()
        )
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenZepBalanceAfterREBUY = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN AFTER (REBUY)',
            zenZepBalanceAfterREBUY.toString()
        )

        expect(
            new BigNumber(zenZepBalanceAfterREBUY.toString()).isGreaterThan(
                zenZepBalanceREBUY.toString()
            )
        ).is.true

        const ZepB4REBUY = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE B4 (REBUY)', ZepB4REBUY.toString())

        await (await ZenNft.burnToClaim()).wait()

        const zenBalanceAfterREBUY = await ZenNft.balanceOf(owner.address)
        console.log(
            'ZEN BALANCE AFTER (REBUY)',
            zenBalanceAfterREBUY.toString()
        )
        expect(zenBalanceAfterREBUY.toNumber()).equal(0)

        const ZepAfterREBUY = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE AFTER (REBUY)', ZepAfterREBUY.toString())

        expect(
            new BigNumber(ZepAfterREBUY.toString()).isGreaterThan(
                ZepB4REBUY.toString()
            )
        ).is.true

        // (fails because 50eth not enough RAND) BUY > 40 ETH (20m fund) --> buys Royalty
        // (fails because 50eth not enough RAND) BUY > 40 ETH (20m fund) --> buys Royalty
        await (
            await UniRouterContract.connect(
                addrR1
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR1.address,
                1856678133,
                { value: (77.5e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        // BURN ADDRESS
        const myIdRand = await RoyaltyNft.getIdForAccount(addrR1.address)
        console.log('my id', myIdRand.toNumber())
        expect(myIdRand).to.equal(0)

        // (success RAND) BUY > 40 ETH (20m fund) --> buys Royalty
        await (
            await UniRouterContract.connect(
                addrR1
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR1.address,
                1856678133,
                { value: (105.5e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        // levelUp
        await evolve(addrR1)

        // BURN ADDRESS
        const myIdRandSucc = await RoyaltyNft.getIdForAccount(addrR1.address)
        expect(myIdRandSucc).to.not.equal(0)
        console.log('my id', myIdRandSucc.toNumber())
        await (
            await RoyaltyNft.connect(addrR1).approve(
                ZenNft.address,
                myIdRandSucc
            )
        ).wait()

        // (FAILS because high level) (RAND BUY > 40 ETH (20m fund) --> buys Zen
        await (
            await UniRouterContract.connect(
                addrR1
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR1.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const zenBalanceB4RANDFail = await ZenNft.connect(addrR1).balanceOf(
            owner.address
        )
        console.log(
            'ZEN BALANCE B4 (RAND-fails)',
            zenBalanceB4RANDFail.toString()
        )
        expect(zenBalanceB4RANDFail.toNumber()).equal(0)

        // (Success) (RAND BUY > 40 ETH (20m fund) --> buys Zen
        const ZepBal = await Zep.balanceOf(addrR1.address)
        // SELL
        await withdraw(addrR1)
        //BUY
        await (
            await UniRouterContract.connect(
                addrR1
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addrR1.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const zenBalanceB4RAND = await ZenNft.connect(addrR1).balanceOf(
            owner.address
        )
        console.log('ZEN BALANCE B4 (RAND)', zenBalanceB4RAND.toString())
        expect(zenBalanceB4RAND.toNumber()).equal(0)

        const zenZepBalanceRand = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN BEFORE (RAND)',
            zenZepBalanceRand.toString()
        )
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenZepBalanceAfterRand = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN AFTER (RAND)',
            zenZepBalanceAfterRand.toString()
        )

        expect(
            new BigNumber(zenZepBalanceAfterRand.toString()).isGreaterThan(
                zenZepBalanceRand.toString()
            )
        ).is.true

        const ZepB4Rand = await Zep.balanceOf(addrR1.address)
        console.log('Zep BALANCE B4 (RAND 2)', ZepB4Rand.toString())

        await (await ZenNft.connect(addrR1).burnToClaim()).wait()

        const zenBalanceAfterRand = await ZenNft.balanceOf(addrR1.address)
        console.log('ZEN BALANCE AFTER (RAND)', zenBalanceAfterRand.toString())
        expect(zenBalanceAfterRand.toNumber()).equal(0)

        const ZepAfterRand = await Zep.balanceOf(addrR1.address)
        console.log('Zep BALANCE AFTER (RAND)', ZepAfterRand.toString())

        expect(
            new BigNumber(ZepAfterRand.toString()).isGreaterThan(
                ZepB4Rand.toString()
            )
        ).is.true
    })

    it('Should not be able to mint more than 500 Zen Spots', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        const zenBalanceB4M = await ZenNft.balanceOf(addr2.address)
        console.log('ZEN BALANCE B4 migrate 1st', zenBalanceB4M.toString())

        await mintFromSnapshot()
        await createInitialZenAccounts()

        const zenBalanceB4AcutalM = await ZenNft.balanceOf(addr2.address)
        console.log(
            'ZEN BALANCE B4 after createZens',
            zenBalanceB4AcutalM.toString()
        )

        const sup = await ZenNft.totalSupply()
        console.log('_sup_', sup.toString())

        // migrate
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        await generateVolume(1)

        const zenBalanceB4 = await ZenNft.balanceOf(addr2.address)
        console.log('ZEN BALANCE B4', zenBalanceB4.toString())

        // BUY > 10 ETH
        await (
            await UniRouterContract.connect(
                addr2
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addr2.address,
                1856678133,
                { value: (18.2e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const sup2 = await ZenNft.totalSupply()
        console.log('_sup_ after', sup2.toString())

        const zenBalanceAfter = await ZenNft.balanceOf(addr2.address)
        console.log('ZEN BALANCE After', zenBalanceAfter.toString())
        expect(zenBalanceAfter.toNumber()).equal(0)
    })

    it('Should be able to burn 500 Zen Spots', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        const zenBalanceB4M = await ZenNft.balanceOf(addr2.address)
        console.log('ZEN BALANCE B4 migrate 1st', zenBalanceB4M.toString())

        await mintFromSnapshot()
        await createInitialZenAccounts(9)

        const zenBalanceB4AcutalM = await ZenNft.balanceOf(addr2.address)
        console.log(
            'ZEN BALANCE B4 after createZens',
            zenBalanceB4AcutalM.toString()
        )

        const sup = await ZenNft.totalSupply()
        console.log('_sup_', sup.toString())

        // migrate
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        const signers = [addr1, addr2, addrR1, addrR2, addrR3, addrR4]
        const supply = await ZenNft.totalSupply()
        console.log('-SUP- initial', supply.toString())

        expect(supply.toNumber()).equal(450)

        await Promise.all(
            signers.map(async (_, i) => {
                const zenBalanceB4 = await ZenNft.balanceOf(signers[i].address)
                console.log('ZEN BALANCE B4', zenBalanceB4.toString())
                expect(zenBalanceB4.toNumber()).equal(0)

                // BUY > 10 ETH
                await (
                    await UniRouterContract.connect(
                        signers[i]
                    ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                        0,
                        [WETH_ADDRESS1, Zep.address],
                        signers[i].address,
                        1856678133,
                        { value: (40e18).toString(), gasLimit: 35000000 }
                    )
                ).wait()

                const zenBalancea = await ZenNft.balanceOf(signers[i].address)
                console.log('ZEN BALANCE After', zenBalancea.toString())
                expect(zenBalancea.toNumber()).equal(1)

                console.log('RESOLVED')
            })
        )

        const totalAfter = await ZenNft.totalSupply()
        expect(totalAfter.toNumber()).equal(450 + signers.length)

        await generateVolume(1)

        const zenZepBalance = await Zep.balanceOf(ZenNft.address)
        console.log('BALANCE DISTRIBUTE ZEN BEFORE ', zenZepBalance.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenZepBalanceAfter = await Zep.balanceOf(ZenNft.address)
        console.log(
            'BALANCE DISTRIBUTE ZEN AFTER ',
            zenZepBalanceAfter.toString()
        )

        expect(
            new BigNumber(zenZepBalanceAfter.toString()).isGreaterThan(
                zenZepBalance.toString()
            )
        ).is.true

        console.log(signers)
        await signers.reduce((chain, _, i) => {
            return chain.then(async () => {
                const zenBalanceB4 = await ZenNft.balanceOf(signers[i].address)
                console.log('ZEN BALANCE B4', zenBalanceB4.toString())
                expect(zenBalanceB4.toNumber()).equal(1)

                const ZepB4 = await Zep.balanceOf(signers[i].address)
                console.log('Zep BALANCE B4', ZepB4.toString())

                await (await ZenNft.connect(signers[i]).burnToClaim()).wait()

                const zenBalanceAfter = await ZenNft.balanceOf(
                    signers[i].address
                )
                console.log('ZEN BALANCE AFTER', zenBalanceAfter.toString())
                expect(zenBalanceAfter.toNumber()).equal(0)

                const ZepAfter = await Zep.balanceOf(signers[i].address)
                console.log('Zep BALANCE AFTER', ZepAfter.toString())

                expect(
                    new BigNumber(ZepAfter.toString()).isGreaterThan(
                        ZepB4.toString()
                    )
                ).is.true

                const supply = await ZenNft.totalSupply()
                console.log('-SUP- final', supply.toString())
                expect(supply.toNumber()).equal(450 + signers.length - i - 1)
            })
        }, Promise.resolve())
    })

    // Needs evolveBlocks set to 5 (rank1) & 20 (rank2)
    it('Should be able to evolve Zen Spot', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        const bal = await Zep.balanceOf(ZenNft.address)
        console.log('>WOW Zen Balance', bal.toString())
        await mintFromSnapshot()
        await createInitialZenAccounts()
        const bal2 = await Zep.balanceOf(ZenNft.address)
        console.log('>WOW mint Zen Balance', bal2.toString())
        // migrate
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())
        const bal3 = await Zep.balanceOf(ZenNft.address)
        console.log('>WOW migrate Zen Balance', bal3.toString())

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        await generateVolume(6)

        const bal4 = await Zep.balanceOf(ZenNft.address)
        console.log('>WOW volume Zen Balance', bal4.toString())

        await (await ZenNft.evolve()).wait()

        const myInfo = await ZenNft.myInfo()
        console.log(
            'TEST FINISH (1) ',
            myInfo.map((v) => v.toString())
        )

        expect(myInfo[0].toNumber()).equal(1)

        await generateVolume(24)

        await (await ZenNft.evolve()).wait()

        const myInfo2 = await ZenNft.myInfo()
        console.log(
            'TEST FINISH (2)',
            myInfo2.map((v) => v.toString())
        )

        expect(myInfo2[0].toNumber()).equal(2)

        const bal5 = await Zep.balanceOf(ZenNft.address)
        console.log('>WOW before distro Zen Balance (2)', bal5.toString())

        // ZEN SEND
        const zenBalanceZep = await Zep.balanceOf(ZenNft.address)
        console.log('->zenBalanceZep2 ', zenBalanceZep.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenBalanceAfterZep = await Zep.balanceOf(ZenNft.address)
        console.log('->zenBalanceAfterZep2', zenBalanceAfterZep.toString())

        expect(
            new BigNumber(zenBalanceAfterZep.toString()).isGreaterThan(
                zenBalanceZep.toString()
            )
        ).is.true

        const bal6 = await Zep.balanceOf(ZenNft.address)
        console.log('>WOW ON distro Zen Balance', bal6.toString())

        // BURN
        const zenBalanceb4 = await ZenNft.balanceOf(owner.address)
        console.log('b4 Zen balance ', zenBalanceb4.toString())
        expect(zenBalanceb4.toNumber()).equal(1)

        const ZepB4 = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE B4', ZepB4.toString())

        await (await ZenNft.burnToClaim()).wait()

        const zenBalanceAfter = await ZenNft.balanceOf(owner.address)
        console.log('ZEN BALANCE AFTER', zenBalanceAfter.toString())
        expect(zenBalanceAfter.toNumber()).equal(0)
    })

    // 2.5ETH, 7.3ETH, 14.5ETH
    it('Should be able to evolve Zen Spot with speedup', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts(1)

        // migrate
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        await generateVolume(1)

        console.log('GIMME !')
        // BUY > 40 ETH
        await buy(owner, 40e18)
        await buy(owner, 100e18)

        await generateVolume(6)

        await (await ZenNft.evolve()).wait()

        const myInfo = await ZenNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfo.map((v) => v.toString())
        )

        expect(myInfo[0].toNumber()).equal(0)

        const ZepB = await Zep.balanceOf(owner.address)
        console.log('ZEPB', ZepB.toString())

        // SPEED-UP (Rank1)
        const ZepFor3Eth = (
            await UniRouterContract.getAmountsIn((2.5e18).toString(), [
                Zep.address,
                WETH_ADDRESS1,
            ])
        )[0]
        console.log('2.5 eth', ZepFor3Eth.toString())
        console.log('2.5 eth', ZepFor3Eth.toString())
        await speedUpZen(ZepFor3Eth)

        const myInfo2 = await ZenNft.myInfo()
        console.log(
            'TEST FINISH (rank1)',
            myInfo2.map((v) => v.toString())
        )
        expect(myInfo2[0].toNumber()).equal(1)

        // SPEED-UP (Rank2)
        const ZepFor6Eth = (
            await UniRouterContract.getAmountsIn((4.8e18).toString(), [
                Zep.address,
                WETH_ADDRESS1,
            ])
        )[0]
        console.log('7.3 eth', ZepFor6Eth.toString())
        console.log('7.3 eth', ZepFor6Eth.toString())
        await speedUpZen(ZepFor6Eth)

        const myInfo3 = await ZenNft.myInfo()
        console.log(
            'TEST FINISH (rank2)',
            myInfo3.map((v) => v.toString())
        )
        expect(myInfo3[0].toNumber()).equal(2)

        const speedstaB = await MilesNft.balanceOf(owner.address)
        console.log('speedsta balance (before)', speedstaB.toString())
        expect(speedstaB.toNumber()).equal(0)

        // SPEED-UP (Rank3)
        const ZepFor10Eth = (
            await UniRouterContract.getAmountsIn((7.2e18).toString(), [
                Zep.address,
                WETH_ADDRESS1,
            ])
        )[0]
        console.log('14.5 eth', ZepFor10Eth.toString())
        console.log('14.5 eth', ZepFor10Eth.toString())
        await speedUpZen(ZepFor10Eth)

        const myInfo4 = await ZenNft.myInfo()
        console.log(
            'TEST FINISH (rank3)',
            myInfo4.map((v) => v.toString())
        )
        expect(myInfo4[0].toNumber()).equal(3)

        const speedstaAfter = await MilesNft.balanceOf(owner.address)
        console.log('speedsta balance (after)', speedstaAfter.toString())
        expect(speedstaAfter.toNumber()).equal(0)
    })

    // 14.5 eth
    // 14.5 eth
    it('Should be able to evolve Zen Spot with speedup to max rank and get speedsta NFT', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts(1)

        // migrate
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        await generateVolume(1)

        console.log('GIMME !')
        // BUY > 40 ETH
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (1e20).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await generateVolume(6)

        await (await ZenNft.evolve()).wait()

        const myInfo = await ZenNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfo.map((v) => v.toString())
        )

        expect(myInfo[0].toNumber()).equal(0)

        const ZepB = await Zep.balanceOf(owner.address)
        console.log('ZEPB', ZepB.toString())

        // SPEED-UP (Rank3)
        const ZepFor10Eth = (
            await UniRouterContract.getAmountsIn((14.5e18).toString(), [
                Zep.address,
                WETH_ADDRESS1,
            ])
        )[0]
        console.log('14.5 eth', ZepFor10Eth.toString())
        console.log('14.5 eth', ZepFor10Eth.toString())

        await speedUpZen(ZepFor10Eth)

        const myInfo4 = await ZenNft.myInfo()
        console.log(
            'TEST FINISH (rank3)',
            myInfo4.map((v) => v.toString())
        )
        expect(myInfo4[0].toNumber()).equal(3)

        const speedstaAfter = await MilesNft.balanceOf(owner.address)
        console.log('speedsta balance (after)', speedstaAfter.toString())
        expect(speedstaAfter.toNumber()).equal(1)
    })

    it('Should be able to evolve Zen Spot with speedup then BURN', async function () {
        // const balanceOfPairV1ZepV1 = "4259566755105980000000000";
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        const supply = await Zep.totalSupply()
        console.log('-SUP- initial', supply.toString())

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts(1)

        // migrate
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const supplyLP = await Zep.totalSupply()
        console.log('-SUP- lp migrate', supplyLP.toString())

        await generateVolume(1)

        console.log('GIMME !')
        // BUY > 40 ETH
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (1e20).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await generateVolume(6)

        await (await ZenNft.evolve()).wait()

        const myInfo = await ZenNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfo.map((v) => v.toString())
        )

        expect(myInfo[0].toNumber()).equal(0)

        const ZepB = await Zep.balanceOf(owner.address)
        console.log('ZEPB', ZepB.toString())

        // SPEED-UP (Rank1)
        const ZepFor3Eth = (
            await UniRouterContract.getAmountsIn((3.5e18).toString(), [
                Zep.address,
                WETH_ADDRESS1,
            ])
        )[0]
        console.log('3 eth', ZepFor3Eth.toString())
        console.log('3 eth', ZepFor3Eth.toString())
        await speedUpZen(ZepFor3Eth)

        const myInfo2 = await ZenNft.myInfo()
        console.log(
            'TEST FINISH (rank1)',
            myInfo2.map((v) => v.toString())
        )
        expect(myInfo2[0].toNumber()).equal(1)

        // SPEED-UP (Rank2)
        const ZepFor6Eth = (
            await UniRouterContract.getAmountsIn((7.2e18).toString(), [
                Zep.address,
                WETH_ADDRESS1,
            ])
        )[0]
        console.log('7.2 eth', ZepFor6Eth.toString())
        console.log('7.2 eth', ZepFor6Eth.toString())
        await speedUpZen(ZepFor6Eth)

        const myInfo3 = await ZenNft.myInfo()
        console.log(
            'TEST FINISH (rank2)',
            myInfo3.map((v) => v.toString())
        )
        expect(myInfo3[0].toNumber()).equal(2)

        const speedstaB = await MilesNft.balanceOf(owner.address)
        console.log('speedsta balance (before)', speedstaB.toString())
        expect(speedstaB.toNumber()).equal(0)

        // SPEED-UP (Rank3)
        const ZepFor10Eth = (
            await UniRouterContract.getAmountsIn((7.2e18).toString(), [
                Zep.address,
                WETH_ADDRESS1,
            ])
        )[0]
        console.log('14.4 eth', ZepFor10Eth.toString())
        console.log('14.4 eth', ZepFor10Eth.toString())
        await speedUpZen(ZepFor10Eth)

        const myInfo4 = await ZenNft.myInfo()
        console.log(
            'TEST FINISH (rank3)',
            myInfo4.map((v) => v.toString())
        )
        expect(myInfo4[0].toNumber()).equal(3)

        // distro zen
        const zenBalanceZep = await Zep.balanceOf(ZenNft.address)
        console.log('->zenBalanceZep2 ', zenBalanceZep.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenBalanceAfterZep = await Zep.balanceOf(ZenNft.address)
        console.log('->zenBalanceAfterZep2', zenBalanceAfterZep.toString())

        // BURN
        const zenBalanceb4 = await ZenNft.balanceOf(owner.address)
        console.log('b4 Zen balance ', zenBalanceb4.toString())
        expect(zenBalanceb4.toNumber()).equal(1)

        const ZepB4 = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE B4', ZepB4.toString())

        await (await ZenNft.burnToClaim()).wait()

        const zenBalanceAfter = await ZenNft.balanceOf(owner.address)
        console.log('ZEN BALANCE AFTER', zenBalanceAfter.toString())
        expect(zenBalanceAfter.toNumber()).equal(0)

        const ZepAfter = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE AFTER', ZepAfter.toString())

        expect(
            new BigNumber(ZepAfter.toString()).isGreaterThan(ZepB4.toString())
        ).is.true
    })

    // ownership
    it('Should be able to transfer ownership ZEN, burn and get rewards (mint 500, burn 1, mint 1, transfer ownership, evolve)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts()

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await ZenNft.balanceOf(owner.address)
        console.log('>Balance 1', b1.toString())

        const ff = await Zep.getFomoFundRaw1()
        console.log('>FOMO FUNDa', ff.toString())

        await generateVolume(72)

        const ff2 = await Zep.getFomoFundRaw1()
        console.log('>FOMO volume FUNDa', ff2.toString())

        // DISTRO
        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('>royalBalance', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('>royalBalance AFTER ', royalBalanceAfter.toString())

        const ff3 = await Zep.getFomoFundRaw1()
        console.log('>FOMO royal FUNDa', ff3.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        // distro zen
        const zenBalanceZep = await Zep.balanceOf(ZenNft.address)
        console.log('->zenBalanceZep2 ', zenBalanceZep.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenBalanceAfterZep = await Zep.balanceOf(ZenNft.address)
        console.log('->zenBalanceAfterZep2', zenBalanceAfterZep.toString())

        const ff4 = await Zep.getFomoFundRaw1()
        console.log('>FOMO zen FUNDa', ff4.toString())

        // BURN
        const zenBalanceb4 = await ZenNft.balanceOf(owner.address)
        console.log('b4 Zen balance ', zenBalanceb4.toString())
        expect(zenBalanceb4.toNumber()).equal(1)

        const ZepB4 = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE B4', ZepB4.toString())

        await (await ZenNft.burnToClaim()).wait()

        const zenBalanceAfter = await ZenNft.balanceOf(owner.address)
        console.log('ZEN BALANCE AFTER', zenBalanceAfter.toString())
        expect(zenBalanceAfter.toNumber()).equal(0)

        const ZepAfter = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE AFTER', ZepAfter.toString())

        expect(
            new BigNumber(ZepAfter.toString()).isGreaterThan(ZepB4.toString())
        ).is.true

        // REBUY --> royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (1e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const myId2 = await RoyaltyNft.getIdForAccount(owner.address)
        expect(myId2).to.not.equal(0)
        console.log('my id', myId2.toNumber())
        await (await RoyaltyNft.approve(ZenNft.address, myId2)).wait()

        // REBUY --> zen
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const zenBalance = await ZenNft.balanceOf(owner.address)
        console.log('Zen balance', zenBalance.toString())
        expect(zenBalance.toNumber()).equal(1)

        await generateVolume(72)

        // DISTRO 2
        // sendRoyaltyRewardsToNft
        const royalBalance2 = await Zep.balanceOf(RoyaltyNft.address)
        console.log('>royalBalance2', royalBalance2.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter2 = await Zep.balanceOf(RoyaltyNft.address)
        console.log('>royalBalance2 after', royalBalanceAfter2.toString())

        expect(
            new BigNumber(royalBalanceAfter2.toString()).isGreaterThan(
                royalBalance2.toString()
            )
        ).is.true

        // distro zen 2
        const zenBalanceZep2 = await Zep.balanceOf(ZenNft.address)
        console.log('->zenBalanceZep2 ', zenBalanceZep2.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenBalanceAfterZep2 = await Zep.balanceOf(ZenNft.address)
        console.log('->zenBalanceAfterZep2', zenBalanceAfterZep2.toString())

        // TRANSFER
        const owB = await ZenNft.balanceOf(owner.address)
        const addr2B = await ZenNft.balanceOf(addr2.address)
        console.log('>TBalance before (2)', owB.toString(), addr2B.toString())
        expect(owB.toNumber()).equal(1)
        expect(addr2B.toNumber()).equal(0)

        const myId = await ZenNft.getIdForAccount(owner.address)
        await (
            await ZenNft['safeTransferFrom(address,address,uint256)'](
                owner.address,
                addr2.address,
                myId.toString()
            )
        ).wait()

        const owB2 = await ZenNft.balanceOf(owner.address)
        const addr2B2 = await ZenNft.balanceOf(addr2.address)
        console.log('>TBalance after (2)', owB2.toString(), addr2B2.toString())
        expect(owB2.toNumber()).equal(0)
        expect(addr2B2.toNumber()).equal(1)

        // BURN AGAIN addr2
        await (await ZenNft.connect(addr2).burnToClaim()).wait()

        const zenBalanceAfter2 = await ZenNft.balanceOf(addr2.address)
        console.log('2 ZEN BALANCE AFTER', zenBalanceAfter2.toString())
        expect(zenBalanceAfter2.toNumber()).equal(0)

        // REBUY 2
        await (
            await UniRouterContract.connect(
                addr2
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addr2.address,
                1856678133,
                { value: (1e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const myId3 = await RoyaltyNft.getIdForAccount(addr2.address)
        expect(myId3).to.not.equal(0)
        console.log('my id', myId3.toNumber())
        await (
            await RoyaltyNft.connect(addr2).approve(ZenNft.address, myId3)
        ).wait()
        await (
            await UniRouterContract.connect(
                addr2
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addr2.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await generateVolume(6)

        await (await ZenNft.connect(addr2).evolve()).wait()

        const myInfo = await ZenNft.connect(addr2).myInfo()
        console.log(
            'TEST FINISH',
            myInfo.map((v) => v.toString())
        )

        expect(myInfo[0].toNumber()).equal(0)

        const ZepB = await Zep.balanceOf(addr2.address)
        console.log('ZEPB', ZepB.toString())

        // 300k
        // TODO
        // await (await ZenNft.connect(addr2).speedUpEvolution("300000000000000000000000")).wait();
        //
        // await (await ZenNft.connect(addr2).evolve()).wait();
        //
        // const myInfo2 = await ZenNft.connect(addr2).myInfo();
        // console.log("TEST FINISH", myInfo2.map((v) => v.toString()));
        // expect(myInfo2[0].toNumber()).equal(1);
        //
        // const speedstaB = await MilesNft.balanceOf(addr2.address);
        // console.log("speedsta balance", speedstaB.toString());
        // expect(speedstaB.toNumber()).equal(1);
    })

    it('Should be able to transfer to Auto-locker (become both zen & royalty holder --> claim)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)

        await mintFromSnapshot()
        await createInitialZenAccounts()

        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        PAIR_ADDRESS_V2 = await Zep.getPairAddress()
        console.log('<<PAIR address>>', PAIR_ADDRESS_V2)
        PairContractV2 = new ethers.Contract(
            PAIR_ADDRESS_V2,
            uniswapPairAbi,
            owner
        )

        const b1 = await ZenNft.balanceOf(addr2.address)
        console.log('>Balance Before', b1.toString())
        expect(b1.toNumber()).equal(0)

        const ff = await Zep.getFomoFundRaw1()
        console.log('FOMO FUNDa', ff.toString())

        await levelUpRoyalties(20)

        await generateVolume(72)

        const zenBalanceb4 = await ZenNft.balanceOf(owner.address)
        console.log('b4 Zen balance ', zenBalanceb4.toString())
        expect(zenBalanceb4.toNumber()).equal(1)

        const ZepB4 = await Zep.balanceOf(owner.address)
        console.log('Zep BALANCE B4', ZepB4.toString())

        await (await ZenNft.burnToClaim()).wait()

        const zenBalanceAfter = await ZenNft.balanceOf(owner.address)
        console.log('ZEN BALANCE AFTER', zenBalanceAfter.toString())
        expect(zenBalanceAfter.toNumber()).equal(0)

        // Become royalty (14.7 ETH)
        await (
            await UniRouterContract.connect(
                addr2
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addr2.address,
                1856678133,
                { value: (10e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const myId2 = await RoyaltyNft.getIdForAccount(addr2.address)
        expect(myId2).to.not.equal(0)
        console.log('my id', myId2.toNumber())
        await (
            await RoyaltyNft.connect(addr2).approve(ZenNft.address, myId2)
        ).wait()

        // REBUY --> zen
        await (
            await UniRouterContract.connect(
                addr2
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addr2.address,
                1856678133,
                { value: (40e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const bD = await ZenNft.balanceOf(addr2.address)
        console.log('>Balance ZEN', bD.toString())
        expect(bD.toNumber()).equal(1)

        const bLNo = await RoyaltyNft.balanceOf(addr2.address)
        console.log('>Balance ROYAL (NO)', bLNo.toString())
        expect(bLNo.toNumber()).equal(0)

        // Become royalty AGAIN
        await (
            await Zep.connect(addr2).testBuy(
                [addr2.address],
                (15.1e18).toString(),
                { value: (30e18).toString(), gasLimit: 50000000 }
            )
        ).wait()

        // Check balances
        const bL2 = await RoyaltyNft.balanceOf(addr2.address)
        console.log('>Balance ROYAL (2nd)', bL2.toString())
        expect(bL2.toNumber()).equal(1)

        // DISTRO
        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('>royalBalance', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('>royalBalance after', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        const valBefore = await Zep.balanceOf(addr2.address)
        await (
            await RoyaltyNft.connect(addr2).claim({ gasPrice: 5000000000 })
        ).wait()
        const valAfter = await Zep.balanceOf(addr2.address)
        expect(valBefore.eq(valAfter)).to.be.true

        // LEVEL UP
        await evolve(addr2)

        // CLAIM & CHECK
        const myBalanceB4 = await Zep.balanceOf(addr2.address)
        const ZepBAutoLock = await Zep.balanceOf(AutoCompounder.address)

        console.log('>Balance claim Before ', myBalanceB4.toString())
        await (
            await RoyaltyNft.connect(addr2).claim({ gasPrice: 5000000000 })
        ).wait()

        const myBalance = await Zep.balanceOf(addr2.address)
        console.log('>Balance claim After', myBalance.toString())
        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true
        const ZepBAutoLockAfter = await Zep.balanceOf(AutoCompounder.address)

        expect(
            new BigNumber(ZepBAutoLockAfter.toString()).isGreaterThan(
                ZepBAutoLock.toString()
            )
        ).is.true

        // AutoLockLPFull
        const resB4 = await PairContractV2.getReserves()
        console.log('B4 autoLockLPFull')
        await (await AutoCompounder.autoLockLPFull()).wait()
        const resAfter = await PairContractV2.getReserves()
        console.log(
            'Reserves: Before',
            resB4[0].toString(),
            resB4[1].toString()
        )
        console.log(
            'Reserves: After',
            resAfter[0].toString(),
            resAfter[1].toString()
        )
        expect(
            new BigNumber(resAfter[0].toString()).isGreaterThan(
                resB4[0].toString()
            )
        ).is.true

        // ZEN SEND
        const zenBalanceZep = await Zep.balanceOf(ZenNft.address)
        console.log('->zenBalanceZep2 ', zenBalanceZep.toString())
        await (await Zep.sendZenRewardsToNft()).wait()
        const zenBalanceAfterZep = await Zep.balanceOf(ZenNft.address)
        console.log('->zenBalanceAfterZep2', zenBalanceAfterZep.toString())

        // BURN ZEN TO CLAIM
        const myBalanceB4Zen = await Zep.balanceOf(addr2.address)

        console.log('>Balance ZEN claim Before ', myBalanceB4Zen.toString())
        await (await ZenNft.connect(addr2).burnToClaim()).wait()

        const zenBalanceAfter2 = await ZenNft.balanceOf(addr2.address)
        console.log('2 ZEN BALANCE AFTER BURN', zenBalanceAfter2.toString())
        expect(zenBalanceAfter2.toNumber()).equal(0)

        const myBalanceZen = await Zep.balanceOf(addr2.address)
        console.log('>Balance ZEN claim After', myBalanceZen.toString())
        expect(
            new BigNumber(myBalanceZen.toString()).isGreaterThan(
                myBalanceB4Zen.toString()
            )
        ).is.true
    })

    // -----------> Rewards
    it('Should be able to mint (ALL) royalty NFTs and (ALL) rewards (+ zens)', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        await mintFromSnapshot()
        await createInitialZenAccounts()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        const ts = await RoyaltyNft.totalSupply()
        console.log('>Balance 1', b1.toString(), ts.toString())

        await mintRoyalties()
        console.log('stignah')
        await validateRewards()

        const tsAfter = await RoyaltyNft.totalSupply()
        expect(tsAfter.toNumber()).equal(3000)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (600e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance', owB.toString())
        expect(owB.toNumber()).equal(0)

        // Transfer
        const myId = await RoyaltyNft.getIdForAccount(manyAddrs[0].address)
        console.log('My id', myId.toNumber())
        expect(myId.toNumber()).not.equal(0)

        await (
            await RoyaltyNft.connect(manyAddrs[0])[
                'safeTransferFrom(address,address,uint256)'
            ](manyAddrs[0].address, owner.address, myId.toString())
        ).wait()

        const owAfter = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance after safeTransfer', owAfter.toString())
        expect(owAfter.toNumber()).equal(1)

        const myInfoFullBefore = await RoyaltyNft.myInfo()

        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (3.1e15).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString()),
            myInfoFullBefore.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(0)
        expect(myInfoFullBefore[1].toNumber() + 1).equal(
            myInfoFullEND[1].toNumber()
        )

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        // Rank1
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (2.2e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await evolve()

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true
    })

    // ownership
    it('Should be able to transfer rewards and consume rewards for withdraw', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        await mintFromSnapshot()
        await createInitialZenAccounts()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        const ts = await RoyaltyNft.totalSupply()
        console.log('>Balance 1', b1.toString(), ts.toString())

        await mintRoyalties(1)
        await validateRewards(1000)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (1e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance', owB.toString(), owB.toString())
        expect(owB.toNumber()).equal(1)

        const myInfoFullBefore = await RoyaltyNft.myInfo()
        console.log('Level (no evolve)', myInfoFullBefore[1].toNumber())
        expect(myInfoFullBefore[1].toNumber()).equal(333)

        try {
            await evolve()
        } catch (e) {
            console.error('Yup !')
        }

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString()),
            myInfoFullBefore.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(0)

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        // Rank2
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (2.2e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const myInfoFullNext = await RoyaltyNft.myInfo()
        console.log('Level Next (no evolve)', myInfoFullNext[1].toNumber())
        expect(myInfoFullNext[1].toNumber()).equal(1066)

        await evolve()

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true

        const rewardIds = await RewardsNft.getIdsForAccount(
            manyAddrs[99].address
        )
        console.log(
            'Reward IDS (owner before)',
            rewardIds.map((id) => id.toString())
        )
        expect(rewardIds.length).equal(1)
        const myId = rewardIds[0]

        await (
            await RewardsNft.connect(manyAddrs[99])[
                'safeTransferFrom(address,address,uint256)'
            ](manyAddrs[99].address, addr2.address, myId.toString())
        ).wait()

        const rewardIds2 = await RewardsNft.getIdsForAccount(addr2.address)
        console.log(
            'Reward IDS (addr2)',
            rewardIds2.map((id) => id.toString())
        )

        expect(rewardIds.length).equal(1)
        expect(rewardIds2[0].toNumber()).equal(myId.toNumber())

        // buy royalty (rank1)
        await (
            await UniRouterContract.connect(
                addr2
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addr2.address,
                1856678133,
                { value: (3e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await evolve(addr2)

        await withdrawWithReward(addr2, myId)
    })

    // ------------> MARKETPLACE
    it('Should be able to whitelist', async function () {
        const balanceOfPairV1ZepV1 = '4259566755105980000000000'

        await (
            await PairContractV1.approve(
                Portal.address,
                '10000000000000000000000000000000'
            )
        ).wait()

        await mintFromSnapshot()
        await createInitialZenAccounts()

        // await Portal.delegateUnlock();
        await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait()
        const balOfOwner = await PairContractV1.balanceOf(owner.address)
        await (
            await Portal.migrate(balanceOfPairV1ZepV1.toString(), {
                value: '600000000000000000000',
                gasLimit: 25000000,
            })
        ).wait()
        console.log(balOfOwner.toString())

        const b1 = await RoyaltyNft.balanceOf(owner.address)
        const ts = await RoyaltyNft.totalSupply()
        console.log('>Balance 1', b1.toString(), ts.toString())

        await mintRoyalties(1)
        await validateRewards(1000)

        // swap = mint new royalty
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (1e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const owB = await RoyaltyNft.balanceOf(owner.address)
        console.log('>LBalance', owB.toString(), owB.toString())
        expect(owB.toNumber()).equal(1)

        const myInfoFullBefore = await RoyaltyNft.myInfo()
        console.log('Level (no evolve)', myInfoFullBefore[1].toNumber())
        expect(myInfoFullBefore[1].toNumber()).equal(333)

        try {
            await evolve()
        } catch (e) {
            console.error('Yup !')
        }

        const myInfoFullEND = await RoyaltyNft.myInfo()
        console.log(
            'TEST FINISH',
            myInfoFullEND.map((v) => v.toString()),
            myInfoFullBefore.map((v) => v.toString())
        )

        expect(myInfoFullEND[0].toNumber()).equal(0)

        // sendRoyaltyRewardsToNft
        const royalBalance = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE BEFORE ', royalBalance.toString())
        await (await Zep.sendRoyaltyRewardsToNft()).wait()
        const royalBalanceAfter = await Zep.balanceOf(RoyaltyNft.address)
        console.log('BALANCE DISTRIBUTE AFTER ', royalBalanceAfter.toString())

        expect(
            new BigNumber(royalBalanceAfter.toString()).isGreaterThan(
                royalBalance.toString()
            )
        ).is.true

        // Rank2
        await (
            await UniRouterContract.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                owner.address,
                1856678133,
                { value: (2.2e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        const myInfoFullNext = await RoyaltyNft.myInfo()
        console.log('Level Next (no evolve)', myInfoFullNext[1].toNumber())
        expect(myInfoFullNext[1].toNumber()).equal(1066)

        await evolve()

        const myBalanceB4 = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM BEFORE ', myBalanceB4.toString())
        await (await RoyaltyNft.claim({ gasPrice: 5000000000 })).wait()
        const myBalance = await Zep.balanceOf(owner.address)
        console.log('BALANCE CLAIM AFTER ', myBalance.toString())

        expect(
            new BigNumber(myBalance.toString()).isGreaterThan(
                myBalanceB4.toString()
            )
        ).is.true

        const rewardIds = await RewardsNft.getIdsForAccount(
            manyAddrs[99].address
        )
        console.log(
            'Reward IDS (owner before)',
            rewardIds.map((id) => id.toString())
        )
        expect(rewardIds.length).equal(1)
        const myId = rewardIds[0]

        await (
            await RewardsNft.connect(manyAddrs[99])[
                'safeTransferFrom(address,address,uint256)'
            ](manyAddrs[99].address, addr2.address, myId.toString())
        ).wait()

        const rewardIds2 = await RewardsNft.getIdsForAccount(addr2.address)
        console.log(
            'Reward IDS (addr2)',
            rewardIds2.map((id) => id.toString())
        )

        expect(rewardIds.length).equal(1)
        expect(rewardIds2[0].toNumber()).equal(myId.toNumber())

        // buy royalty (rank1)
        await (
            await UniRouterContract.connect(
                addr2
            ).swapExactETHForTokensSupportingFeeOnTransferTokens(
                0,
                [WETH_ADDRESS1, Zep.address],
                addr2.address,
                1856678133,
                { value: (3e18).toString(), gasLimit: 35000000 }
            )
        ).wait()

        await evolve(addr2)

        await withdrawWithReward(addr2, myId)
    })
})
