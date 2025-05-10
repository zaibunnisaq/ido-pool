const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("IDOPool", function () {
  let idoPool, paymentToken, offeringToken;
  let owner, user1, user2, user3, addrs;

  // Constants for the IDO parameters
  const RATE = 10;
  const SOFT_CAP = ethers.utils.parseEther("50");
  const HARD_CAP = ethers.utils.parseEther("100");
  const MIN_CONTRIBUTION = ethers.utils.parseEther("1");
  const MAX_CONTRIBUTION = ethers.utils.parseEther("10");

  beforeEach(async function () {
    [owner, user1, user2, user3, ...addrs] = await ethers.getSigners();

    // Deploy tokens
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    paymentToken = await TokenFactory.deploy("Payment Token", "PAY", 18, ethers.utils.parseEther("1000000"));
    offeringToken = await TokenFactory.deploy("Offering Token", "OFFER", 18, ethers.utils.parseEther("1000000"));
    await paymentToken.deployed();
    await offeringToken.deployed();

    // Distribute tokens
    await paymentToken.transfer(user1.address, ethers.utils.parseEther("100"));
    await paymentToken.transfer(user2.address, ethers.utils.parseEther("100"));
    await paymentToken.transfer(user3.address, ethers.utils.parseEther("100"));

    // Deploy IDO pool
    const IDOPool = await ethers.getContractFactory("IDOPool");
    idoPool = await IDOPool.deploy(
      paymentToken.address,
      offeringToken.address,
      RATE,
      SOFT_CAP,
      HARD_CAP,
      MIN_CONTRIBUTION,
      MAX_CONTRIBUTION
    );
    await idoPool.deployed();

    // Approvals
    await paymentToken.connect(user1).approve(idoPool.address, ethers.constants.MaxUint256);
    await paymentToken.connect(user2).approve(idoPool.address, ethers.constants.MaxUint256);
    await paymentToken.connect(user3).approve(idoPool.address, ethers.constants.MaxUint256);

    // Deposit offering tokens
    const offeringAmount = ethers.utils.parseEther("1000");
    await offeringToken.approve(idoPool.address, offeringAmount);
    await idoPool.depositOfferingTokens(offeringAmount);

    // Set pool times
    const now = await time.latest();
    const startTime = now + 3600;
    const endTime = startTime + 86400;
    const refundEndTime = endTime + 86400;
    await idoPool.startPool(startTime, endTime, refundEndTime);
  });

  describe("Pool Setup", function () {
    it("Should update parameters correctly", async function () {
      const newEndTime = (await idoPool.endTime()).add(3600);
      await idoPool.updateEndTime(newEndTime);
      expect(await idoPool.endTime()).to.equal(newEndTime);
      
      const newRefundEndTime = (await idoPool.refundEndTime()).add(3600);
      await idoPool.updateRefundEndTime(newRefundEndTime);
      expect(await idoPool.refundEndTime()).to.equal(newRefundEndTime);
    });
    
    it("Should deposit offering tokens correctly", async function () {
      const initialBalance = await offeringToken.balanceOf(idoPool.address);
      const additionalTokens = ethers.utils.parseEther("500");
      
      await offeringToken.approve(idoPool.address, additionalTokens);
      await idoPool.depositOfferingTokens(additionalTokens);
      
      const finalBalance = await offeringToken.balanceOf(idoPool.address);
      expect(finalBalance).to.equal(initialBalance.add(additionalTokens));
    });
    
    it("Should start the pool correctly", async function () {
      const startTime = await idoPool.startTime();
      await time.increaseTo(startTime.toNumber());
      
      const state = await idoPool.poolState();
      expect(state).to.equal(1); // ACTIVE state
      
      const contributionAmount = ethers.utils.parseEther("5");
      await idoPool.connect(user1).buyTokens(contributionAmount);
      
      const contribution = await idoPool.contributions(user1.address);
      expect(contribution).to.equal(contributionAmount);
    });
  });
  
  describe("Token Purchase", function () {
    beforeEach(async function () {
      // Start the IDO
      const startTime = await idoPool.startTime();
      await time.increaseTo(startTime.toNumber());
    });
    
    it("Should allow users to buy tokens", async function () {
      const contributionAmount = ethers.utils.parseEther("5");
      await idoPool.connect(user1).buyTokens(contributionAmount);
      
      const contribution = await idoPool.contributions(user1.address);
      expect(contribution).to.equal(contributionAmount);
      
      const raisedAmount = await idoPool.totalRaised();
      expect(raisedAmount).to.equal(contributionAmount);
    });
    
    it("Should respect min and max contribution limits", async function () {
      // Below minimum
      await expect(
        idoPool.connect(user1).buyTokens(ethers.utils.parseEther("0.5"))
      ).to.be.revertedWith("Below minimum contribution");
      
      // Above maximum
      await expect(
        idoPool.connect(user1).buyTokens(ethers.utils.parseEther("11"))
      ).to.be.revertedWith("Exceeds maximum contribution");
      
      // Valid amount
      await idoPool.connect(user1).buyTokens(ethers.utils.parseEther("5"));
      
      // Top up that would exceed max
      await expect(
        idoPool.connect(user1).buyTokens(ethers.utils.parseEther("6"))
      ).to.be.revertedWith("Exceeds maximum contribution");
    });
    
    it("Should enforce hard cap limit", async function () {
      // Fill up to just below hard cap
      await idoPool.connect(user1).buyTokens(MAX_CONTRIBUTION);
      await idoPool.connect(user2).buyTokens(MAX_CONTRIBUTION);
      await idoPool.connect(user3).buyTokens(MAX_CONTRIBUTION);
      await idoPool.connect(addrs[0]).buyTokens(MAX_CONTRIBUTION);
      await idoPool.connect(addrs[1]).buyTokens(MAX_CONTRIBUTION);
      await idoPool.connect(addrs[2]).buyTokens(MAX_CONTRIBUTION);
      await idoPool.connect(addrs[3]).buyTokens(MAX_CONTRIBUTION);
      await idoPool.connect(addrs[4]).buyTokens(MAX_CONTRIBUTION);
      await idoPool.connect(addrs[5]).buyTokens(MAX_CONTRIBUTION);
      
      // This should exceed the hard cap
      await expect(
        idoPool.connect(addrs[6]).buyTokens(MAX_CONTRIBUTION)
      ).to.be.revertedWith("Exceeds hard cap");
    });
  });

  });
  
  describe("Finalization and Token Distribution", function () {
    beforeEach(async function () {
      // Start the IDO
      const startTime = await idoPool.startTime();
      await time.increaseTo(startTime.toNumber());
      
      // Reach soft cap
      await idoPool.connect(user1).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(user2).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(user3).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(addrs[0]).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(addrs[1]).buyTokens(ethers.utils.parseEther("10"));
      
      // End the IDO
      const endTime = await idoPool.endTime();
      await time.increaseTo(endTime.toNumber() + 1);
    });
    
    it("Should finalize the pool correctly when soft cap is reached", async function () {
      // Verify IDO state is ENDED
      expect(await idoPool.state()).to.equal(2); // ENDED state
      
      // Finalize the IDO
      await idoPool.finalize();
      
      // Verify IDO state is FINALIZED
      expect(await idoPool.state()).to.equal(3); // FINALIZED state
      
      // Check token distribution
      const user1Allocation = (await idoPool.contributions(user1.address)).mul(RATE);
      await idoPool.connect(user1).claimTokens();
      expect(await offeringToken.balanceOf(user1.address)).to.equal(user1Allocation);
    });
  });
  
  describe("Refund Mechanism", function () {
    it("Should enable refunds when soft cap is not met", async function () {
      // Start the IDO
      const startTime = await idoPool.startTime();
      await time.increaseTo(startTime.toNumber());
      
      // Participate with less than soft cap
      await idoPool.connect(user1).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(user2).buyTokens(ethers.utils.parseEther("10"));
      
      // End the IDO
      const endTime = await idoPool.endTime();
      await time.increaseTo(endTime.toNumber() + 1);
      
      // Finalize the IDO
      await idoPool.finalize();
      
      // Verify IDO state is REFUNDING
      expect(await idoPool.state()).to.equal(4); // REFUNDING state
    });
    
    it("Should allow admin to enable refunds manually", async function () {
      // Start the IDO
      const startTime = await idoPool.startTime();
      await time.increaseTo(startTime.toNumber());
      
      // Reach soft cap
      await idoPool.connect(user1).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(user2).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(user3).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(addrs[0]).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(addrs[1]).buyTokens(ethers.utils.parseEther("10"));
      
      // End the IDO
      const endTime = await idoPool.endTime();
      await time.increaseTo(endTime.toNumber() + 1);
      
      // Manually enable refunds
      await idoPool.enableRefund();
      
      // Verify IDO state is REFUNDING
      expect(await idoPool.state()).to.equal(4); // REFUNDING state
    });
    
    it("Should allow users to claim refunds when in refunding state", async function () {
      // Start the IDO
      const startTime = await idoPool.startTime();
      await time.increaseTo(startTime.toNumber());
      
      // Participate with less than soft cap
      const contributionAmount = ethers.utils.parseEther("10");
      await idoPool.connect(user1).buyTokens(contributionAmount);
      
      // Initial balance
      const initialBalance = await paymentToken.balanceOf(user1.address);
      
      // End the IDO
      const endTime = await idoPool.endTime();
      await time.increaseTo(endTime.toNumber() + 1);
      
      // Finalize the IDO
      await idoPool.finalize();
      
      // Claim refund
      await idoPool.connect(user1).claimRefund();
      
      // Check refund was processed
      const finalBalance = await paymentToken.balanceOf(user1.address);
      expect(finalBalance).to.equal(initialBalance.add(contributionAmount));
    });
    
    it("Should prevent refunds after token claim", async function () {
      // Start the IDO
      const startTime = await idoPool.startTime();
      await time.increaseTo(startTime.toNumber());
      
      // Reach soft cap
      await idoPool.connect(user1).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(user2).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(user3).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(addrs[0]).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(addrs[1]).buyTokens(ethers.utils.parseEther("10"));
      
      // End the IDO
      const endTime = await idoPool.endTime();
      await time.increaseTo(endTime.toNumber() + 1);
      
      // Finalize the IDO
      await idoPool.finalize();
      
      // Claim tokens
      await idoPool.connect(user1).claimTokens();
      
      // Enable refunds
      await idoPool.enableRefund();
      
      // Try to claim refund after tokens claimed
      await expect(
        idoPool.connect(user1).claimRefund()
      ).to.be.revertedWith("Tokens already claimed");
    });
    
    it("Should enforce refund end time", async function () {
      // Start the IDO
      const startTime = await idoPool.startTime();
      await time.increaseTo(startTime.toNumber());
      
      // Participate with less than soft cap
      await idoPool.connect(user1).buyTokens(ethers.utils.parseEther("10"));
      
      // End the IDO
      const endTime = await idoPool.endTime();
      await time.increaseTo(endTime.toNumber() + 1);
      
      // Finalize the IDO
      await idoPool.finalize();
      
      // Move past refund end time
      const refundEndTime = await idoPool.refundEndTime();
      await time.increaseTo(refundEndTime.toNumber() + 1);
      
      // Try to claim refund after refund end time
      await expect(
        idoPool.connect(user1).claimRefund()
      ).to.be.revertedWith("Refund period has ended");
    });
  });
  
  describe("Admin Functions", function () {
    it("Should allow owner to withdraw raised funds after successful IDO", async function () {
      // Start the IDO
      const startTime = await idoPool.startTime();
      await time.increaseTo(startTime.toNumber());
      
      // Reach soft cap
      const totalContributions = ethers.utils.parseEther("50");
      await idoPool.connect(user1).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(user2).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(user3).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(addrs[0]).buyTokens(ethers.utils.parseEther("10"));
      await idoPool.connect(addrs[1]).buyTokens(ethers.utils.parseEther("10"));
      
      // End the IDO
      const endTime = await idoPool.endTime();
      await time.increaseTo(endTime.toNumber() + 1);
      
      // Finalize the IDO
      await idoPool.finalize();
      
      // Get owner's initial balance
      const initialBalance = await paymentToken.balanceOf(owner.address);
      
      // Withdraw funds
      await idoPool.withdrawRaisedFunds();
      
      // Verify funds were transferred to owner
      const finalBalance = await paymentToken.balanceOf(owner.address);
      expect(finalBalance).to.equal(initialBalance.add(totalContributions));
    });
    
    it("Should allow owner to withdraw unsold tokens", async function () {
      // Start the IDO
      const startTime = await idoPool.startTime();
      await time.increaseTo(startTime.toNumber());
      
      // Participate but don't buy all tokens
      await idoPool.connect(user1).buyTokens(ethers.utils.parseEther("10"));
      
      // End the IDO
      const endTime = await idoPool.endTime();
      await time.increaseTo(endTime.toNumber() + 1);
      
      // Finalize the IDO and enable refunds (soft cap not met)
      await idoPool.finalize();
      
      // After refund period ends
      const refundEndTime = await idoPool.refundEndTime();
      await time.increaseTo(refundEndTime.toNumber() + 1);
      
      // Get initial balances
      const initialBalance = await offeringToken.balanceOf(owner.address);
      const contractBalance = await offeringToken.balanceOf(idoPool.address);
      
      // Withdraw unsold tokens
      await idoPool.withdrawUnsoldTokens();
      
      // Verify tokens were transferred to owner
      const finalBalance = await offeringToken.balanceOf(owner.address);
      expect(finalBalance).to.equal(initialBalance.add(contractBalance));
    });
  });
