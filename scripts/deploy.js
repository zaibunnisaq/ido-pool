const hre = require("hardhat");

async function main() {
  
  const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
  
  console.log("Deploying Payment Token...");
  const paymentToken = await MockERC20.deploy(
    "Payment Token",
    "PAY",
    18,
    1000000
  );
  await paymentToken.deployed();
  console.log("Payment Token deployed to:", paymentToken.address);
  
  console.log("Deploying Offering Token...");
  const offeringToken = await MockERC20.deploy(
    "Offering Token",
    "OFF",
    18,
    1000000
  );
  await offeringToken.deployed();
  console.log("Offering Token deployed to:", offeringToken.address);
  
  // IDO parameters
  const tokenPrice = hre.ethers.utils.parseUnits("0.1", 18); // 0.1 payment token per offering token
  const softCap = hre.ethers.utils.parseUnits("50", 18);     // 50 payment tokens
  const hardCap = hre.ethers.utils.parseUnits("100", 18);    // 100 payment tokens
  const minContribution = hre.ethers.utils.parseUnits("1", 18); // 1 payment token
  const maxContribution = hre.ethers.utils.parseUnits("20", 18); // 20 payment tokens
  
  // Deploy IDO Pool
  const IDOPool = await hre.ethers.getContractFactory("IDOPool");
  console.log("Deploying IDO Pool...");
  const idoPool = await IDOPool.deploy(
    paymentToken.address,
    offeringToken.address,
    tokenPrice,
    softCap,
    hardCap,
    minContribution,
    maxContribution
  );
  await idoPool.deployed();
  console.log("IDO Pool deployed to:", idoPool.address);
  
  console.log("Deployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
