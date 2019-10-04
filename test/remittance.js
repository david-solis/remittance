const Remittance = artifacts.require('Remittance');
const helperTime = require('ganache-time-traveler');
const { advanceTime } = helperTime;
const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');
const {createTransactionResult, eventEmitted, reverts} = truffleAssert;
const {toBN, toWei, asciiToHex} = web3.utils;
const {getBalance} = web3.eth;
const uuidv4 = require("uuid/v4");

contract('Remittance', (accounts) => {
    const BN_0 = toBN("0");
    const BN_HETH = toBN(toWei("0.5", "ether"));
    const BN_1ETH = toBN(toWei("1", "ether"));

    const BN_FEE = toBN(toWei("0.05", "ether"));
    const BN_MIN = toBN(2592000); // 1 month in secs
    const BN_MAX = toBN(7776000); // 3 months in secs

    const BN_LT_MIN = toBN(1296000);  // 15 days in secs
    const BN_DUEDATE = toBN(2592000); // 1 month in secs
    const BN_GT_MAX = toBN(10368000); // 4 months in secs

    const DUEDATE_MS = 2592000 * 1000; // 1 month in msecs

    const FAKE_ID = asciiToHex("LAZY_TOWN");
    const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

    const [ALICE, BOB, CAROL] = accounts;
    let remittance;

    beforeEach("deploy", async () => {
        remittance = await Remittance.new(BN_FEE, BN_MIN, BN_MAX, {from: ALICE});
    });

    describe("constructor", function () {
        it("should have initial balance equals to zero", async () => {
            const balance = toBN(await getBalance(remittance.address));
            assert(balance.eq(BN_0), "contract balance is not zero");
        });

        it("should have emmitted fee set event", async () => {
            const result = await createTransactionResult(remittance, remittance.transactionHash);
            await eventEmitted(result, "LogFeeSet", log => {
                return log.sender === ALICE && log.fee.eq(BN_FEE);
            });
        });

        it("should set remittance fee accordingly", async () => {
            const fee = await remittance.getFee({from: ALICE});
            assert.isTrue(fee.eq(BN_FEE), "remittance fee mismatch");
        });
    });


    describe("fallback function", function() {
        it("should reject direct transaction with value", async () => {
            await reverts(
                remittance.sendTransaction({from: ALICE, value: 1, gas: 3000000})
            );
        });

        it("should reject direct transaction without value", async () => {
            await reverts(
                remittance.sendTransaction({from: ALICE, gas: 3000000})
            );
        });
    });

    describe("Pausable", function() {
        it("should have deployer as pauser", async () => {
            const result = await remittance.pause({from: ALICE});
            await eventEmitted(result, "Paused", log => {
                return (log.sender === ALICE);
            });
            const isPaused = await remittance.isPaused();
            assert.isTrue(isPaused, "deployer is not pauser");
        });

        it("should reject other account as pauser", async () => {
            await reverts(
                remittance.pause({from: BOB}), "Owned: not owner"
            );
        });
    });

    describe("escrow ids", function () {
        it("should have different escrow ids across instances given same parameters", async () => {
            const otherInstance = await Remittance.new(BN_FEE, BN_MIN, BN_MAX, {from: ALICE});

            const secret1 = [], secret2 = [];
            uuidv4(null, secret1, 0);
            uuidv4(null, secret2, 0);

            const remittanceEscrowId = await remittance.generateEscrowId(CAROL, secret1, secret2);
            const otherInstanceEscrowId = await otherInstance.generateEscrowId(CAROL, secret1, secret2);

            assert.notEqual(remittanceEscrowId, otherInstanceEscrowId);
        });
    });

    describe("fee getter and setter", function () {
        it("should change fee", async () => {
            const result = await remittance.setFee(BN_HETH, {from: ALICE});
            await eventEmitted(result, "LogFeeSet", log => {
                return log.sender === ALICE && log.fee.eq(BN_HETH);
            });
            const fee = await remittance.getFee({from: ALICE});
            assert.isTrue(fee.eq(BN_HETH), "remittance fee mismatch");
        });
    });

    describe("dueDate range getter and setter", () => {
        it("should change range", async () => {
            const result = await remittance.setDueDateRange(BN_DUEDATE, BN_GT_MAX, {from: ALICE});
            await eventEmitted(result, "LogDueDateRangeSet", log => {
                return (log.sender === ALICE && log.minDueDate.eq(BN_DUEDATE) && log.maxDueDate.eq(BN_GT_MAX));
            });
            const range = await remittance.getDueDateRange({from: ALICE});
            assert.isTrue(range.min.eq(BN_DUEDATE), "range min mismatch");
            assert.isTrue(range.max.eq(BN_GT_MAX), "range max mismatch");
        });
    });

    describe("deposit", () => {
        it("should revert on invalid recipient", async () => {
            await reverts(
                remittance.deposit(FAKE_ID, ADDRESS_ZERO, BN_DUEDATE, {from: ALICE}), "invalid recipient"
            );
        });

        it("should revert on previous remittance", async () => {
            await remittance.deposit(FAKE_ID, BOB, BN_DUEDATE, {from: ALICE, value: BN_HETH});
            await reverts(
                remittance.deposit(FAKE_ID, BOB, BN_DUEDATE, {from: ALICE, value: BN_HETH}), "previous remittance"
            );
        });

        it("should revert on value less than fee", async () => {
            await reverts(
                remittance.deposit(FAKE_ID, BOB, BN_DUEDATE, {from: ALICE, value: BN_0}), "value less than fee"
            );
        });

        it("should revert on deadline out of range (LT min)", async () => {
            await reverts(
                remittance.deposit(FAKE_ID, BOB, BN_LT_MIN, {from: ALICE, value: BN_HETH}), "due date out of rang"
            );
        });

        it("should revert on deadline out of range (GT max)", async () => {
            await reverts(
                remittance.deposit(FAKE_ID, BOB, BN_GT_MAX, {from: ALICE, value: BN_HETH}), "due date out of rang"
            );
        });

        it("should start remittance (deposit)", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(BOB, secret, secret);
            const balance1a = toBN(await getBalance(remittance.address));
            const balance2a = toBN(await getBalance(ALICE));
            const result = await remittance.deposit(id, BOB, BN_DUEDATE, {from: ALICE, value: BN_1ETH});
            await eventEmitted(result, "LogDeposited", log => {
                return (log.escrowId === id && log.sender === ALICE && log.recipient === BOB &&
                    BN_1ETH.sub(BN_FEE).eq(log.amount) && BN_FEE.eq(log.fee));
            });
            const balance1b = toBN(await getBalance(remittance.address));
            assert.isTrue(balance1b.sub(balance1a).eq(BN_1ETH), "contract balance mismatch");
            const balance2b = toBN(await getBalance(ALICE));
            const gasUsed2b = toBN(result.receipt.gasUsed);
            const transact2b = await web3.eth.getTransaction(result.tx);
            const gasPrice2b = toBN(transact2b.gasPrice);
            assert.isTrue(balance2a.sub(balance2b.add(gasUsed2b.mul(gasPrice2b))).eq(BN_1ETH), "sender balance mismatch");
            const info = await remittance.escrows(id);
            assert.strictEqual(info.sender, ALICE, "sender mismatch");
            assert.strictEqual(info.recipient, BOB, "recipient mismatch");
            assert.isTrue(BN_1ETH.sub(BN_FEE).eq(info.amount), "amount mismatch");
        });
    });

    describe("transfer", () => {
        it("should revert on remittance not set", async () => {
            await reverts(
                remittance.transfer(ALICE, FAKE_ID, FAKE_ID, {from: BOB}), "remittance not set"
            );
        });

        it("should revert on remittance already claimed", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(BOB, secret, secret);
            await remittance.deposit(id, BOB, BN_DUEDATE, {from: ALICE, value: BN_1ETH});
            await remittance.transfer(ALICE, secret, secret, {from: BOB});
            await reverts(
                remittance.transfer(ALICE, secret, secret, {from: BOB}),
                "remittance already claimed"
            );
        });

        it("should revert on remittance not found", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(BOB, secret, secret);
            await remittance.deposit(id, BOB, BN_DUEDATE, {from: ALICE, value: BN_1ETH});
            await reverts(
                remittance.transfer(ALICE, FAKE_ID, FAKE_ID, {from: BOB}),
                "remittance not set"
            );
        });

        it("should complete remittance (transfer)", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(BOB, secret, secret);
            await remittance.deposit(id, BOB, BN_DUEDATE, {from: ALICE, value: BN_1ETH});
            const balance1a = toBN(await getBalance(remittance.address));
            const balance2a = toBN(await getBalance(BOB));
            const result = await remittance.transfer(ALICE, secret, secret, {from: BOB});
            await eventEmitted(result, "LogWTransferred", log => {
                return (log.escrowId === id && log.recipient === BOB && BN_1ETH.sub(BN_FEE).eq(log.amount));
            });
            const balance1b = toBN(await getBalance(remittance.address));
            assert.isTrue(balance1a.sub(balance1b).eq(BN_1ETH.sub(BN_FEE)), "contract balance mismatch");
            const balance2b = toBN(await getBalance(BOB));
            const gasUsed2b = toBN(result.receipt.gasUsed);
            const transact2b = await web3.eth.getTransaction(result.tx);
            const gasPrice2b = toBN(transact2b.gasPrice);
            assert.isTrue(balance2b.add(gasUsed2b.mul(gasPrice2b)).sub(balance2a).eq(BN_1ETH.sub(BN_FEE)), "recipient balance mismatch");
            const info = await remittance.escrows(id);
            assert.strictEqual(info.sender, ADDRESS_ZERO, "sender not released");
            assert.strictEqual(info.recipient, ADDRESS_ZERO, "recipient not released");
            assert.isTrue(info.amount.eq(BN_0), "amount not released");
            assert.isFalse(info.dueDate.eq(BN_0), "due date was released");
        });
    });

    describe("Function: reclaim", () => {
        it("should revert on remittance not set", async () => {
            await reverts(
                remittance.reclaim(FAKE_ID, BOB, { from: ALICE }),
                "remittance not set"
            );
        });

        it("should revert on remittance already claimed", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(BOB, secret, secret);
            await remittance.deposit(id, BOB, BN_DUEDATE, {from: ALICE, value: BN_1ETH});
            await remittance.transfer(ALICE, secret, secret, { from: BOB });
            await reverts(
                remittance.reclaim(id, BOB, { from: ALICE }),
                "remittance already claimed"
            );
        });

        it("should revert on too early to reclaim", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(BOB, secret, secret);

            await remittance.deposit(id, BOB, BN_DUEDATE, {from: ALICE, value: BN_1ETH});
            await reverts(
                remittance.reclaim(id, BOB, { from: ALICE }),"too early to reclaim");
        });

        it("should complete remittance (reclaim)", async () => {
            const secret = [];
            uuidv4(null, secret, 0);
            const id = await remittance.generateEscrowId(BOB, secret, secret);
            await remittance.deposit(id, BOB, BN_DUEDATE, {from: ALICE, value: BN_1ETH});
            const balance1a = toBN(await getBalance(remittance.address));
            const balance2a = toBN(await getBalance(ALICE));
            await advanceTime(DUEDATE_MS);
            const result = await remittance.reclaim(id, BOB, { from: ALICE });
            await eventEmitted(result, "LogReclaimed", log => {
                return (log.escrowId === id && log.sender === ALICE && BN_1ETH.sub(BN_FEE).eq(log.amount));
            });
            const balance1b = toBN(await getBalance(remittance.address));
            assert.isTrue(balance1a.sub(balance1b).eq(BN_1ETH.sub(BN_FEE)), "contract balance mismatch");
            const balance2b = toBN(await getBalance(ALICE));
            const gasUsed2b = toBN(result.receipt.gasUsed);
            const transact2b = await web3.eth.getTransaction(result.tx);
            const gasPrice2b = toBN(transact2b.gasPrice);
            assert.isTrue(balance2b.add(gasUsed2b.mul(gasPrice2b)).sub(balance2a).eq(BN_1ETH.sub(BN_FEE)),
                "recipient balance mismatch");
            const info = await remittance.escrows(id);
            assert.strictEqual(info.sender, ADDRESS_ZERO, "sender not released");
            assert.strictEqual(info.recipient, ADDRESS_ZERO, "recipient not released");
            assert.isTrue(info.amount.eq(BN_0), "amount not released");
            assert.isFalse(info.dueDate.eq(BN_0), "due date was released");
        });
    });
});
