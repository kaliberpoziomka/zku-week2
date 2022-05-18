// [assignment] please copy the entire modified custom.test.js here
const hre = require('hardhat')
const { ethers, waffle } = hre
const { loadFixture } = waffle
const { expect } = require('chai')
const { utils } = ethers

const Utxo = require('../src/utxo')
const { transaction, registerAndTransact, prepareTransaction, buildMerkleTree } = require('../src/index')
const { toFixedHex, poseidonHash } = require('../src/utils')
const { Keypair } = require('../src/keypair')
const { encodeDataForBridge } = require('./utils')

const MERKLE_TREE_HEIGHT = 5
const l1ChainId = 1
const MINIMUM_WITHDRAWAL_AMOUNT = utils.parseEther(process.env.MINIMUM_WITHDRAWAL_AMOUNT || '0.05')
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1')

describe('Custom Tests', function () {
  this.timeout(20000)

  async function deploy(contractName, ...args) {
    const Factory = await ethers.getContractFactory(contractName)
    const instance = await Factory.deploy(...args)
    return instance.deployed()
  }

  async function fixture() {
  require('../scripts/compileHasher')
  const [sender, gov, l1Unwrapper, multisig] = await ethers.getSigners()
  const verifier2 = await deploy('Verifier2')
  const verifier16 = await deploy('Verifier16')
  const hasher = await deploy('Hasher')

  const token = await deploy('PermittableToken', 'Wrapped ETH', 'WETH', 18, l1ChainId)
  await token.mint(sender.address, utils.parseEther('10000'))

  const amb = await deploy('MockAMB', gov.address, l1ChainId)
  const omniBridge = await deploy('MockOmniBridge', amb.address)

  /** @type {TornadoPool} */
  const tornadoPoolImpl = await deploy(
    'TornadoPool',
    verifier2.address,
    verifier16.address,
    MERKLE_TREE_HEIGHT,
    hasher.address,
    token.address,
    omniBridge.address,
    l1Unwrapper.address,
    gov.address,
    l1ChainId,
    multisig.address,
  )

  const { data } = await tornadoPoolImpl.populateTransaction.initialize(
    MINIMUM_WITHDRAWAL_AMOUNT,
    MAXIMUM_DEPOSIT_AMOUNT,
  )
  const proxy = await deploy(
    'CrossChainUpgradeableProxy',
    tornadoPoolImpl.address,
    gov.address,
    data,
    amb.address,
    l1ChainId,
  )

  const tornadoPool = tornadoPoolImpl.attach(proxy.address)

  await token.approve(tornadoPool.address, utils.parseEther('10000'))

  return { tornadoPool, token, proxy, omniBridge, amb, gov, multisig }
  }
  
  describe("Tests", async () => {
    it('[assignment] ii. deposit 0.1 ETH in L1 -> withdraw 0.08 ETH in L2 -> assert balances', async () => {
      
      //* Alice dopists in L1
      let { tornadoPool, token, omniBridge } = await loadFixture(fixture)

      const aliceKeypair = new Keypair()

      // doposit into tornado pool
      const aliceDepositAmount = utils.parseEther('0.1')
      const aliceDepositUtxo = new Utxo({ 
        amount: aliceDepositAmount, 
        keypair: aliceKeypair 
      })

      const { args, extData } = await prepareTransaction({
        tornadoPool,
        outputs: [aliceDepositUtxo],
      })

      const onTokenBridgedData = encodeDataForBridge({
        proof: args,
        extData,
      })

      const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
        token.address,
        aliceDepositUtxo.amount,
        onTokenBridgedData,
      )

        // emulating bridge. first it sends tokens to omnibridge mock then it sends to the pool
      await token.transfer(omniBridge.address, aliceDepositAmount)
      const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)

      await omniBridge.execute([
        { who: token.address, callData: transferTx.data }, // send tokens to pool
        { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
      ])
      //*

      //& Alice withdraws in L2

      const aliceWithdrawAmount = utils.parseEther('0.08')
      const recipient = '0xDeaD00000000000000000000000000000000BEEf'
      const aliceChangeUtxo = new Utxo({
        amount: aliceDepositAmount.sub(aliceWithdrawAmount),
        keypair: aliceKeypair,
      })

      await transaction({
        tornadoPool,
        inputs: [aliceDepositUtxo],
        outputs: [aliceChangeUtxo],
        recipient: recipient,
        isL1Withdrawal: false,
      })
      //&

      //? Tests

      const recipientBalance = await token.balanceOf(recipient)
      // balance of recipient should be equal to 0.08 eth
      expect(recipientBalance).to.be.equal(utils.parseEther('0.08'))
      const omniBridgeBalance = await token.balanceOf(omniBridge.address)
      // balance of omniBridge should be 0, since me passed to tornadoPool
      expect(omniBridgeBalance).to.be.equal(0)
      const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
      // tornadoPool balance should be 0.02
      expect(tornadoPoolBalance).to.be.equal(utils.parseEther('0.02'))
      
      //?

    })

    it('[assignment] iii. see assignment doc for details', async () => {
        // [assignment] complete code here
      const [addr1, addr2] = await ethers.getSigners()
      //* Alice deposit in L1
      let { tornadoPool, token, omniBridge } = await loadFixture(fixture)

      const aliceKeypair = new Keypair()

      // doposit into tornado pool
      const aliceDepositAmount = utils.parseEther('0.13')
      const aliceDepositUtxo = new Utxo({ 
        amount: aliceDepositAmount, 
        keypair: aliceKeypair 
      })

      const { args, extData } = await prepareTransaction({
        tornadoPool,
        outputs: [aliceDepositUtxo],
      })

      const onTokenBridgedData = encodeDataForBridge({
        proof: args,
        extData,
      })

      const onTokenBridgedTx = await tornadoPool.populateTransaction.onTokenBridged(
        token.address,
        aliceDepositUtxo.amount,
        onTokenBridgedData,
      )

        // emulating bridge. first it sends tokens to omnibridge mock then it sends to the pool
      await token.transfer(omniBridge.address, aliceDepositAmount)
      const transferTx = await token.populateTransaction.transfer(tornadoPool.address, aliceDepositAmount)

      await omniBridge.execute([
        { who: token.address, callData: transferTx.data }, // send tokens to pool
        { who: tornadoPool.address, callData: onTokenBridgedTx.data }, // call onTokenBridgedTx
      ])
      //*

      //& Alice sending to Bob in L2
      const bobKeypair = new Keypair()

      const bobSendAmount = utils.parseEther('0.06')
      const bobSendUtxo = new Utxo({ 
        amount: bobSendAmount, 
        keypair: bobKeypair, 
      })
      const aliceChangeUtxo = new Utxo({
        amount: aliceDepositAmount.sub(bobSendAmount),
        keypair: aliceKeypair,
      })
      await transaction({ 
        tornadoPool, 
        inputs: [aliceDepositUtxo], 
        outputs: [bobSendUtxo, aliceChangeUtxo] 
      })

      //&

      // Bob Parses chain to detect incoming funds -- not necessary but we can check if funds were transfered correctly
      const filter = tornadoPool.filters.NewCommitment()
      const fromBlock = await ethers.provider.getBlock()
      const events = await tornadoPool.queryFilter(filter, fromBlock.number)
      let bobReceiveUtxo
      try { // we check both events, because in this Utxo were two outputs, and it shuffles output before sending to blockchain
        bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[0].args.encryptedOutput, events[0].args.index)
      } catch (e) {
        // we try to decrypt another output here because it shuffles outputs before sending to blockchain
        bobReceiveUtxo = Utxo.decrypt(bobKeypair, events[1].args.encryptedOutput, events[1].args.index)
      }
      expect(bobReceiveUtxo.amount).to.be.equal(bobSendAmount)
      //

      //^ Bob withdraws all in L2
      const bobEthAddress = '0xDeaD00000000000000000000000000000000BEEf'
      const bobChangeUtxo = new Utxo({ 
        amount: 0,  // we want to witdraw everything, so the new Utxo will be zero
        keypair: bobKeypair 
      })
      await transaction({
        tornadoPool,
        inputs: [bobReceiveUtxo],
        outputs: [bobChangeUtxo],
        recipient: bobEthAddress,
        isL1Withdrawal: false,
      })
      //^

      //~ Alice withdraws all her finds in L1
      const aliceEthAddress = addr2.address
      const aliceChangeUtxo_2 = new Utxo({
        amount: 0,  // we want to witdraw everything, so the new Utxo will be zero
        keypair: aliceKeypair,
      })

      await transaction({
        tornadoPool,
        inputs: [aliceChangeUtxo],
        outputs: [aliceChangeUtxo_2],
        recipient: aliceEthAddress,
        isL1Withdrawal: true,
      })
      //~


      //? Tests
      // balance of aliceEth should be equal to 0 eth, since she withdrawed in L1 (to the omniBridge)
      const aliceEthAddressBalance = await token.balanceOf(aliceEthAddress)
      expect(aliceEthAddressBalance).to.be.equal(0)

      // balance of omniBridge should be 0.07 (amount that Alice withdrawed), 
      // since Alice dopisted to L1
      const omniBridgeBalance = await token.balanceOf(omniBridge.address)
      expect(omniBridgeBalance).to.be.equal(utils.parseEther('0.07'))

      // balance of bobEth should be equal to amount Bob withdrawed (0.06 Eth)
      // since Bob withdrawed in L2
      const bobEthAddressBalance = await token.balanceOf(bobEthAddress)
      expect(bobEthAddressBalance).to.be.equal(utils.parseEther('0.06'))

      // tornadoPool balance should be 0, it is nothing there
      const tornadoPoolBalance = await token.balanceOf(tornadoPool.address)
      expect(tornadoPoolBalance).to.be.equal(0)
      //?

    })
  });
})
