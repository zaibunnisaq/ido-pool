// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./MockERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title IDOPool
 * @dev A contract for Initial DEX Offering (IDO) that accepts payments in ERC-20 tokens
 * and provides refund mechanisms for both users and admin.
 */
contract IDOPool is Ownable, ReentrancyGuard {
    using SafeERC20 for MockERC20;
    using Address for address;

    // IDO State
    enum PoolState {
        Pending,
        Active,
        Completed,
        Cancelled,
        Refunding
    }

    // Pool configuration
    MockERC20 public paymentToken;    // The token users will pay with
    MockERC20 public offeringToken;   // The token being sold in the IDO
    uint256 public tokenPrice;     // Price of offering token in payment token units
    uint256 public softCap;        // Minimum amount to raise
    uint256 public hardCap;        // Maximum amount to raise
    uint256 public minContribution;// Minimum contribution per user
    uint256 public maxContribution;// Maximum contribution per user
    
    // IDO timing
    uint256 public startTime;
    uint256 public endTime;
    uint256 public refundEndTime;  // Deadline for claiming refunds
    
    // IDO state
    PoolState public poolState;
    uint256 public totalRaised;
    uint256 public totalDistributed;
    
    // User contributions
    mapping(address => uint256) public contributions;
    mapping(address => bool) public hasClaimedTokens;
    mapping(address => bool) public hasClaimedRefund;
    
    // Admin tracking
    address public admin;
    bool public tokensDeposited;
    
    // Events
    event PoolStateChanged(PoolState state);
    event TokensPurchased(address indexed buyer, uint256 paymentAmount, uint256 tokenAmount);
    event TokensClaimed(address indexed user, uint256 amount);
    event RefundClaimed(address indexed user, uint256 amount);
    event TokensDeposited(uint256 amount);
    event AdminRefundEnabled();
    event ParametersUpdated();

    /**
     * @dev Constructor to initialize the IDO pool
     * @param _paymentToken Address of the ERC-20 token used for payment
     * @param _offeringToken Address of the token being sold
     * @param _tokenPrice Price of one offering token in payment token units
     * @param _softCap Minimum amount to raise
     * @param _hardCap Maximum amount to raise
     * @param _minContribution Minimum contribution per user
     * @param _maxContribution Maximum contribution per user
     */
    constructor(
        address _paymentToken,
        address _offeringToken,
        uint256 _tokenPrice,
        uint256 _softCap,
        uint256 _hardCap,
        uint256 _minContribution,
        uint256 _maxContribution
    ) {
        require(_paymentToken != address(0), "Payment token cannot be zero address");
        require(_offeringToken != address(0), "Offering token cannot be zero address");
        require(_tokenPrice > 0, "Token price must be greater than zero");
        require(_softCap > 0, "Soft cap must be greater than zero");
        require(_hardCap >= _softCap, "Hard cap must be >= soft cap");
        require(_minContribution > 0, "Min contribution must be greater than zero");
        require(_maxContribution >= _minContribution, "Max contribution must be >= min contribution");
        
        // Validate that addresses are actually contracts
        require(_paymentToken.isContract(), "Payment token is not a contract");
        require(_offeringToken.isContract(), "Offering token is not a contract");
        
        // Validate the ERC20 interface by calling a method
        try MockERC20(_paymentToken).totalSupply() returns (uint256) {
            // Success, it's a valid ERC20
        } catch {
            revert("Payment token does not implement ERC20 interface");
        }
        
        try MockERC20(_offeringToken).totalSupply() returns (uint256) {
            // Success, it's a valid ERC20
        } catch {
            revert("Offering token does not implement ERC20 interface");
        }
        
        paymentToken = MockERC20(_paymentToken);
        offeringToken = MockERC20(_offeringToken);
        tokenPrice = _tokenPrice;
        softCap = _softCap;
        hardCap = _hardCap;
        minContribution = _minContribution;
        maxContribution = _maxContribution;
        
        admin = msg.sender;
        poolState = PoolState.Pending;
    }
    
    /**
     * @dev Updates the IDO parameters (only owner)
     * @param _tokenPrice New token price
     * @param _softCap New soft cap
     * @param _hardCap New hard cap
     * @param _minContribution New minimum contribution
     * @param _maxContribution New maximum contribution
     */
    function updateParameters(
        uint256 _tokenPrice,
        uint256 _softCap,
        uint256 _hardCap,
        uint256 _minContribution,
        uint256 _maxContribution
    ) external onlyOwner {
        require(poolState == PoolState.Pending, "Cannot update parameters after IDO has started");
        require(_tokenPrice > 0, "Token price must be greater than zero");
        require(_softCap > 0, "Soft cap must be greater than zero");
        require(_hardCap >= _softCap, "Hard cap must be >= soft cap");
        require(_minContribution > 0, "Min contribution must be greater than zero");
        require(_maxContribution >= _minContribution, "Max contribution must be >= min contribution");
        
        tokenPrice = _tokenPrice;
        softCap = _softCap;
        hardCap = _hardCap;
        minContribution = _minContribution;
        maxContribution = _maxContribution;
        
        emit ParametersUpdated();
    }
    
    /**
     * @dev Deposits offering tokens to the pool (only owner)
     * @param _amount Amount of tokens to deposit
     */
    function depositOfferingTokens(uint256 _amount) external onlyOwner {
        require(poolState == PoolState.Pending, "Can only deposit before IDO starts");
        require(_amount > 0, "Amount must be greater than zero");
        
        uint256 requiredTokens = hardCap / tokenPrice;
        require(_amount >= requiredTokens, "Insufficient tokens for hard cap");
        
        offeringToken.safeTransferFrom(msg.sender, address(this), _amount);
        tokensDeposited = true;
        
        emit TokensDeposited(_amount);
    }
    
    /**
     * @dev Starts the IDO (only owner)
     * @param _startTime Start time of the IDO
     * @param _endTime End time of the IDO
     * @param _refundEndTime End time for claiming refunds
     */
    function startPool(
        uint256 _startTime,
        uint256 _endTime,
        uint256 _refundEndTime
    ) external onlyOwner {
        require(poolState == PoolState.Pending, "Pool must be in pending state");
        require(tokensDeposited, "Offering tokens must be deposited first");
        require(_startTime > block.timestamp, "Start time must be in the future");
        require(_endTime > _startTime, "End time must be after start time");
        require(_refundEndTime > _endTime, "Refund end time must be after end time");
        
        startTime = _startTime;
        endTime = _endTime;
        refundEndTime = _refundEndTime;
        
        poolState = PoolState.Active;
        emit PoolStateChanged(PoolState.Active);
    }
    
    /**
     * @dev Allows users to buy tokens using the payment token
     * @param _amount Amount of payment tokens to contribute
     */
    function buyTokens(uint256 _amount) external nonReentrant {
        require(poolState == PoolState.Active, "Pool is not active");
        require(block.timestamp >= startTime, "IDO has not started yet");
        require(block.timestamp <= endTime, "IDO has ended");
        require(_amount >= minContribution, "Contribution below minimum");
        
        uint256 newContribution = contributions[msg.sender] + _amount;
        require(newContribution <= maxContribution, "Exceeds maximum contribution");
        
        uint256 newTotalRaised = totalRaised + _amount;
        require(newTotalRaised <= hardCap, "Hard cap reached");
        
        // Update state before external calls
        contributions[msg.sender] = newContribution;
        totalRaised = newTotalRaised;
        
        // Calculate tokens to receive
        uint256 tokensToReceive = _amount * 10**18 / tokenPrice;
        
        // Transfer payment tokens from user
        paymentToken.safeTransferFrom(msg.sender, address(this), _amount);
        
        emit TokensPurchased(msg.sender, _amount, tokensToReceive);
    }
    
    /**
     * @dev Finalizes the IDO (only owner)
     */
    function finalize() external onlyOwner {
        require(poolState == PoolState.Active, "Pool is not active");
        require(block.timestamp > endTime || totalRaised >= hardCap, "IDO not yet ended");
        
        if (totalRaised >= softCap) {
            poolState = PoolState.Completed;
        } else {
            poolState = PoolState.Refunding;
        }
        
        emit PoolStateChanged(poolState);
    }
    
    /**
     * @dev Enables refund mode (only owner)
     */
    function enableRefund() external onlyOwner {
        require(poolState == PoolState.Active || poolState == PoolState.Completed, 
                "Can only enable refund in active or completed state");
        
        poolState = PoolState.Refunding;
        emit PoolStateChanged(PoolState.Refunding);
        emit AdminRefundEnabled();
    }
    
    /**
     * @dev Allows users to claim their tokens if IDO is successful
     */
    function claimTokens() external nonReentrant {
        require(poolState == PoolState.Completed, "Pool is not completed");
        require(contributions[msg.sender] > 0, "No contribution found");
        require(!hasClaimedTokens[msg.sender], "Tokens already claimed");
        
        uint256 userContribution = contributions[msg.sender];
        uint256 tokensToReceive = userContribution * 10**18 / tokenPrice;
        
        hasClaimedTokens[msg.sender] = true;
        totalDistributed += tokensToReceive;
        
        offeringToken.safeTransfer(msg.sender, tokensToReceive);
        
        emit TokensClaimed(msg.sender, tokensToReceive);
    }
    
    /**
     * @dev Allows users to claim refunds if IDO is in refunding state
     */
    function claimRefund() external nonReentrant {
        require(poolState == PoolState.Refunding, "Refunds not available");
        require(block.timestamp <= refundEndTime, "Refund period ended");
        require(contributions[msg.sender] > 0, "No contribution found");
        require(!hasClaimedRefund[msg.sender], "Refund already claimed");
        require(!hasClaimedTokens[msg.sender], "Cannot refund after claiming tokens");
        
        uint256 refundAmount = contributions[msg.sender];
        
        // Update state before external call
        hasClaimedRefund[msg.sender] = true;
        
        // Send refund
        paymentToken.safeTransfer(msg.sender, refundAmount);
        
        emit RefundClaimed(msg.sender, refundAmount);
    }
    
    /**
     * @dev Allows owner to withdraw raised funds after IDO is completed
     */
    function withdrawRaisedFunds() external onlyOwner {
        require(poolState == PoolState.Completed, "IDO not completed");
        require(block.timestamp > refundEndTime, "Wait until refund period ends");
        
        uint256 balance = paymentToken.balanceOf(address(this));
        require(balance > 0, "No funds to withdraw");
        
        paymentToken.safeTransfer(msg.sender, balance);
    }
    
    /**
     * @dev Allows owner to recover any unsold tokens after IDO
     */
    function withdrawUnsoldTokens() external onlyOwner {
        require(poolState == PoolState.Completed || poolState == PoolState.Cancelled || poolState == PoolState.Refunding, 
                "IDO must be completed, cancelled or refunding");
        require(block.timestamp > refundEndTime, "Wait until refund period ends");
        
        uint256 balance = offeringToken.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        
        offeringToken.safeTransfer(msg.sender, balance);
    }
    
    /**
     * @dev Calculates the amount of tokens a user would receive
     * @param _user Address of the user
     * @return Amount of tokens the user would receive
     */
    function getUserTokenAmount(address _user) external view returns (uint256) {
        if (contributions[_user] == 0) {
            return 0;
        }
        return contributions[_user] * 10**18 / tokenPrice;
    }
    
    /**
     * @dev Checks if pool reached soft cap
     * @return True if soft cap is reached
     */
    function isSoftCapReached() public view returns (bool) {
        return totalRaised >= softCap;
    }
    
    /**
     * @dev Checks if pool reached hard cap
     * @return True if hard cap is reached
     */
    function isHardCapReached() public view returns (bool) {
        return totalRaised >= hardCap;
    }
}