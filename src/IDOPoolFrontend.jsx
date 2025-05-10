import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import IDOPoolABI from '../artifacts/contracts/IDOPool.sol/IDOPool.json';
import ERC20ABI from '../artifacts/contracts/MockERC20.sol/MockERC20.json';

const IDOPoolFrontend = () => {
  // State variables
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [idoPool, setIdoPool] = useState(null);
  const [paymentToken, setPaymentToken] = useState(null);
  const [offeringToken, setOfferingToken] = useState(null);
  const [poolInfo, setPoolInfo] = useState({
    state: '',
    tokenPrice: 0,
    softCap: 0,
    hardCap: 0,
    totalRaised: 0,
    minContribution: 0,
    maxContribution: 0,
    startTime: 0,
    endTime: 0,
    refundEndTime: 0
  });
  const [userInfo, setUserInfo] = useState({
    contribution: 0,
    tokensToBuy: 0,
    hasClaimedTokens: false,
    hasClaimedRefund: false,
    paymentTokenBalance: 0,
    offeringTokenBalance: 0
  });
  const [buyAmount, setBuyAmount] = useState('');

  // Contract addresses - replace with your deployed contract addresses
  const idoPoolAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  
  // Connect to wallet
  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const web3Signer = web3Provider.getSigner();
        
        setProvider(web3Provider);
        setSigner(web3Signer);
        setAccount(accounts[0]);
        
        // Initialize contracts
        const poolContract = new ethers.Contract(idoPoolAddress, IDOPoolABI.abi, web3Signer);
        setIdoPool(poolContract);
        
        // Get payment and offering token addresses
        const paymentTokenAddress = await poolContract.paymentToken();
        const offeringTokenAddress = await poolContract.offeringToken();
        
        // Initialize token contracts
        const paymentTokenContract = new ethers.Contract(paymentTokenAddress, ERC20ABI.abi, web3Signer);
        const offeringTokenContract = new ethers.Contract(offeringTokenAddress, ERC20ABI.abi, web3Signer);
        
        setPaymentToken(paymentTokenContract);
        setOfferingToken(offeringTokenContract);
        
        // Load initial data
        loadPoolInfo(poolContract);
        loadUserInfo(poolContract, paymentTokenContract, offeringTokenContract, accounts[0]);
      } catch (error) {
        console.error("Error connecting to wallet:", error);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };
  
  // Load pool information
  const loadPoolInfo = async (poolContract) => {
    try {
      const states = ['Pending', 'Active', 'Completed', 'Cancelled', 'Refunding'];
      const stateIndex = await poolContract.poolState();
      const tokenPrice = ethers.utils.formatEther(await poolContract.tokenPrice());
      const softCap = ethers.utils.formatEther(await poolContract.softCap());
      const hardCap = ethers.utils.formatEther(await poolContract.hardCap());
      const totalRaised = ethers.utils.formatEther(await poolContract.totalRaised());
      const minContribution = ethers.utils.formatEther(await poolContract.minContribution());
      const maxContribution = ethers.utils.formatEther(await poolContract.maxContribution());
      const startTime = await poolContract.startTime();
      const endTime = await poolContract.endTime();
      const refundEndTime = await poolContract.refundEndTime();
      
      setPoolInfo({
        state: states[stateIndex],
        tokenPrice,
        softCap,
        hardCap,
        totalRaised,
        minContribution,
        maxContribution,
        startTime: startTime.toString(),
        endTime: endTime.toString(),
        refundEndTime: refundEndTime.toString()
      });
    } catch (error) {
      console.error("Error loading pool info:", error);
    }
  };
  
  // Load user information
  const loadUserInfo = async (poolContract, paymentTokenContract, offeringTokenContract, userAddress) => {
    try {
      const contribution = ethers.utils.formatEther(await poolContract.contributions(userAddress));
      const tokenAmount = ethers.utils.formatEther(await poolContract.getUserTokenAmount(userAddress));
      const hasClaimedTokens = await poolContract.hasClaimedTokens(userAddress);
      const hasClaimedRefund = await poolContract.hasClaimedRefund(userAddress);
      const paymentTokenBalance = ethers.utils.formatEther(await paymentTokenContract.balanceOf(userAddress));
      const offeringTokenBalance = ethers.utils.formatEther(await offeringTokenContract.balanceOf(userAddress));
      
      setUserInfo({
        contribution,
        tokensToBuy: tokenAmount,
        hasClaimedTokens,
        hasClaimedRefund,
        paymentTokenBalance,
        offeringTokenBalance
      });
    } catch (error) {
      console.error("Error loading user info:", error);
    }
  };
  
  // Buy tokens
  const handleBuyTokens = async () => {
    if (!idoPool || !paymentToken) return;
    
    try {
      const amount = ethers.utils.parseEther(buyAmount);
      
      // Approve payment token first
      const approveTx = await paymentToken.approve(idoPoolAddress, amount);
      await approveTx.wait();
      
      // Buy tokens
      const buyTx = await idoPool.buyTokens(amount);
      await buyTx.wait();
      
      alert("Successfully bought tokens!");
      
      // Refresh data
      loadPoolInfo(idoPool);
      loadUserInfo(idoPool, paymentToken, offeringToken, account);
      setBuyAmount('');
    } catch (error) {
      console.error("Error buying tokens:", error);
      alert(`Error: ${error.message}`);
    }
  };
  
  // Claim tokens
  const handleClaimTokens = async () => {
    if (!idoPool) return;
    
    try {
      const tx = await idoPool.claimTokens();
      await tx.wait();
      
      alert("Successfully claimed tokens!");
      
      // Refresh data
      loadUserInfo(idoPool, paymentToken, offeringToken, account);
    } catch (error) {
      console.error("Error claiming tokens:", error);
      alert(`Error: ${error.message}`);
    }
  };
  
  // Claim refund
  const handleClaimRefund = async () => {
    if (!idoPool) return;
    
    try {
      const tx = await idoPool.claimRefund();
      await tx.wait();
      
      alert("Successfully claimed refund!");
      
      // Refresh data
      loadUserInfo(idoPool, paymentToken, offeringToken, account);
    } catch (error) {
      console.error("Error claiming refund:", error);
      alert(`Error: ${error.message}`);
    }
  };
  
  // Format timestamp to readable date
  const formatTimestamp = (timestamp) => {
    if (!timestamp || timestamp === '0') return 'Not set';
    return new Date(timestamp * 1000).toLocaleString();
  };
  
  // Effect to load data on initial load
  useEffect(() => {
    connectWallet();
  }, []);

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">IDO Pool Interface</h1>
      
      {!account ? (
        <button 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={connectWallet}
        >
          Connect Wallet
        </button>
      ) : (
        <div>
          <div className="bg-gray-100 p-4 rounded-lg mb-6">
            <h2 className="text-xl font-semibold mb-4">Pool Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p><strong>State:</strong> {poolInfo.state}</p>
                <p><strong>Token Price:</strong> {poolInfo.tokenPrice} PAY per OFF</p>
                <p><strong>Soft Cap:</strong> {poolInfo.softCap} PAY</p>
                <p><strong>Hard Cap:</strong> {poolInfo.hardCap} PAY</p>
                <p><strong>Total Raised:</strong> {poolInfo.totalRaised} PAY</p>
              </div>
              <div>
                <p><strong>Min Contribution:</strong> {poolInfo.minContribution} PAY</p>
                <p><strong>Max Contribution:</strong> {poolInfo.maxContribution} PAY</p>
                <p><strong>Start Time:</strong> {formatTimestamp(poolInfo.startTime)}</p>
                <p><strong>End Time:</strong> {formatTimestamp(poolInfo.endTime)}</p>
                <p><strong>Refund End Time:</strong> {formatTimestamp(poolInfo.refundEndTime)}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-100 p-4 rounded-lg mb-6">
            <h2 className="text-xl font-semibold mb-4">Your Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p><strong>Connected Account:</strong> {account.substring(0, 6)}...{account.substring(account.length - 4)}</p>
                <p><strong>Your Contribution:</strong> {userInfo.contribution} PAY</p>
                <p><strong>Tokens to Receive:</strong> {userInfo.tokensToBuy} OFF</p>
              </div>
              <div>
                <p><strong>Payment Token Balance:</strong> {userInfo.paymentTokenBalance} PAY</p>
                <p><strong>Offering Token Balance:</strong> {userInfo.offeringTokenBalance} OFF</p>
                <p><strong>Claimed Tokens:</strong> {userInfo.hasClaimedTokens ? 'Yes' : 'No'}</p>
                <p><strong>Claimed Refund:</strong> {userInfo.hasClaimedRefund ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-100 p-4 rounded-lg mb-6">
            <h2 className="text-xl font-semibold mb-4">Buy Tokens</h2>
            <div className="flex items-center mb-4">
              <input
                type="number"
                placeholder="Amount (PAY)"
                className="border rounded p-2 mr-2"
                value={buyAmount}
                onChange={(e) => setBuyAmount(e.target.value)}
              />
              <button 
                className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
                onClick={handleBuyTokens}
                disabled={poolInfo.state !== 'Active'}
              >
                Buy
              </button>
            </div>
            {buyAmount && (
              <p className="text-sm">You will receive approximately {Number(buyAmount) / Number(poolInfo.tokenPrice)} OFF tokens</p>
            )}
          </div>
          
          <div className="flex space-x-4">
            <button 
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              onClick={handleClaimTokens}
              disabled={poolInfo.state !== 'Completed' || userInfo.hasClaimedTokens}
            >
              Claim Tokens
            </button>
            
            <button 
              className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded"
              onClick={handleClaimRefund}
              disabled={poolInfo.state !== 'Refunding' || userInfo.hasClaimedRefund}
            >
              Claim Refund
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IDOPoolFrontend;