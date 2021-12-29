it("Should be able to mint (ALL) royal NFTs and (ALL) collectibles, then be able to transfer, evolve and claim", async function() {
    const balanceOfPairV1 = "4259566755105980000000000";

    await (await PairContractV1.approve(Portal.address, LARGE_NUMBER)).wait();

    await mintFromSnapshot();
    await mintInitialLimeSpots();

    // await Portal.delegateUnlock();
    await (await V1LPLOCK_CONTRACT.unlockLPTokens()).wait();
    await (await Portal.migrate(balanceOfPairV1.toString(), { value: 10e18.toString(), gasLimit: 25000000 })).wait();

    await mintLoyalties();
    await validateCollectible();

    const tsAfter = await LoyalNft.totalSupply();
    expect(tsAfter.toNumber(), "Couldn't mint all").equal(3000);

    // Should NOT MINT
    await buy(owner, 600e18);
    const owB = await LoyalNft.balanceOf(owner.address);
    expect(owB.toNumber(), "Was able to mint even tho 3000/3000").equal(0);

    await transferLoyal(manyAddrs[0], owner);

    // Transfer FAILS since already
    let failed = false;
    try {
        await transferLoyal(manyAddrs[1], owner);
    } catch (err) {
        console.error(err);
        failed = true;
    }
    expect(failed, "Transfer should have failed: Already owning").to.be.true;

    await transferCollectible(manyAddrs[0], owner);

    // Levels up correctly
    const myInfoBefore = await LoyalNft.myInfo();
    await buy(owner, 3.1e15);
    const myInfoAfter = await LoyalNft.myInfo();

    expect(myInfoAfter.rank.toNumber()).equal(0);
    expect(myInfoBefore.level.toNumber() + 1).equal(myInfoAfter.level.toNumber());

    await sendLoyalRewards()

    // Rank1
    await buy(owner, 2.2e18);
    await evolve()
    await claim()
});
