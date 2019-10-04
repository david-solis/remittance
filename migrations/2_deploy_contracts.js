const Remittance = artifacts.require("Remittance");
const { toBN, toWei } = web3.utils;

module.exports = function(deployer) {
    deployer.deploy(
        Remittance,
        toBN(toWei("0.03", "ether")),
        2592000, // 1 month in secs
        7776000  // 3 months in secs
    );
};
