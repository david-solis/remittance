const truffleAssert = require('truffle-assertions');
const {eventEmitted, reverts} = truffleAssert;

const Owned = artifacts.require("Owned");

contract('Owned', accounts => {
    const [owner, newOwner] = accounts;
    let owned;

    beforeEach("deploy new Owned", async () => {
        owned = await Owned.new({from: owner});
    });

    describe("owner", function () {
        it("Initial owner", async () => {
            assert.strictEqual(await owned.getOwner(), owner);
        });

        it("should not be possible to change owner if not owner", async function () {
            await reverts(
                owned.setOwner(newOwner, {from: newOwner})
            );
        });

        it("Change owner", async () => {
            const result = await owned.setOwner(newOwner, {from: owner});
            assert.isTrue(result.receipt.status, "status must be true");
            // We expect one event
            assert.strictEqual(result.receipt.logs.length, 1);
            assert.strictEqual(result.logs.length, 1);
            // Check contract
            assert.equal(await owned.getOwner(), newOwner);
            // Check event
            await eventEmitted(result, "LogOwnerSet", log => {
                return log.previousOwner === owner && log.newOwner === newOwner;
            });
        });
    });
});

