
# IDO Pool Smart Contract Implementation

A Solidity smart contract implementation for managing Initial DEX Offerings (IDO) with ERC-20 token payments and refund capabilities.

### Core Functionality
- **ERC-20 Payment Support**: Accepts payments in any ERC-20 compliant token
- **Contribution Tracking**: Records individual user contributions with min/max limits
- **Refund System**: 
  - Automatic refunds if soft cap not reached
  - Admin-triggered refunds
  - Time-bound refund window
- **Admin Controls**:
  - Start/stop pool
  - Update parameters
  - Withdraw funds
  - Enable manual refunds

### Security Features
- Reentrancy protection using OpenZeppelin's ReentrancyGuard
- SafeERC20 transfers for token operations
- Comprehensive input validation
- Proper access control with Ownable pattern

## Prerequisites
- Node.js v16 or later
- npm v7 or later
- Hardhat development environment
- Basic understanding of smart contract development
- MetaMask wallet (optional, for frontend interaction)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/zaibunnisaq/ido-pool.git
cd ido-pool
```

2. Install dependencies:
```bash
npm install
npm install --save-dev hardhat @openzeppelin/contracts @nomicfoundation/hardhat-toolbox
```

## Deployment

### Local Development Network
1. Start a local Hardhat node:
```bash
npx hardhat node
```

2. In a new terminal, deploy contracts:
```bash
npx hardhat run scripts/deploy.js --network localhost
```

Sample deployment output:
```
Deploying Payment Token...
Payment Token deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Deploying Offering Token...
Offering Token deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
Deploying IDO Pool...
IDO Pool deployed to: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

### Mainnet/Testnet Deployment
1. Create `.env` file with:
```
INFURA_API_KEY=your_infura_key
PRIVATE_KEY=your_wallet_private_key
```

2. Update `hardhat.config.js` with network configurations

3. Deploy to network:
```bash
npx hardhat run scripts/deploy.js --network <network_name>
```

## Testing

### Automated Tests
Run the test suite:
```bash
npx hardhat test
```

Test coverage includes:
- Token purchase validation
- Contribution limit enforcement
- Refund scenarios
- Admin function security
- Edge case handling

### Manual Testing
1. Start Hardhat console:
```bash
npx hardhat console --network localhost
```

2. Example test commands:
```javascript
// Get contract instances
const IDOPool = await ethers.getContractAt("IDOPool", "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0");
const PaymentToken = await ethers.getContractAt("MockERC20", "0x5FbDB2315678afecb367f032d93F642f64180aa3");

// Test token purchase
await PaymentToken.approve(IDOPool.address, ethers.utils.parseEther("10"));
await IDOPool.buyTokens(ethers.utils.parseEther("5"));

// Check contribution
await IDOPool.contributions(await ethers.provider.getSigner().getAddress());
```

## Contract Addresses
| Contract       | Local Network Address                         |
|----------------|-----------------------------------------------|
| Payment Token  | 0x5FbDB2315678afecb367f032d93F642f64180aa3    |
| Offering Token | 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512    |
| IDO Pool       | 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0    |

