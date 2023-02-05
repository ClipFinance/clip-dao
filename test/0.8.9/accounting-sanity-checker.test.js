const hre = require('hardhat')
const { ETH } = require('../helpers/utils')
const { assert } = require('../helpers/assert')

const mocksFilePath = 'contracts/0.8.9/test_helpers/OracleReportSanityCheckerMocks.sol'
const LidoMock = hre.artifacts.require(`${mocksFilePath}:LidoStub`)
const OracleReportSanityChecker = hre.artifacts.require('OracleReportSanityChecker')
const LidoLocatorMock = hre.artifacts.require(`${mocksFilePath}:LidoLocatorStub`)
const WithdrawalQueueMock = hre.artifacts.require(`${mocksFilePath}:WithdrawalQueueStub`)

function wei(number, units = 'ether') {
  switch (units) {
    case 'ether':
      return BigInt(number) * 10n ** 18n
  }
  throw new Error(`Unsupported units "${units}"`)
}

contract('OracleReportSanityChecker', ([deployer, admin, withdrawalVault, ...accounts]) => {
  let oracleReportSanityChecker, lidoLocatorMock, lidoMock, withdrawalQueueMock
  const managersRoster = {
    allLimitsManagers: accounts.slice(0, 2),
    churnValidatorsByEpochLimitManagers: accounts.slice(2, 4),
    oneOffCLBalanceDecreaseLimitManagers: accounts.slice(4, 6),
    annualBalanceIncreaseLimitManagers: accounts.slice(6, 8),
    shareRateDeviationLimitManagers: accounts.slice(8, 10),
    requestCreationBlockMarginManagers: accounts.slice(10, 12),
    maxPositiveTokenRebaseManagers: accounts.slice(12, 14)
  }
  const defaultLimitsList = {
    churnValidatorsByEpochLimit: 55,
    oneOffCLBalanceDecreaseBPLimit: 5_00, // 5%
    annualBalanceIncreaseBPLimit: 10_00, // 10%
    shareRateDeviationBPLimit: 2_50, // 2.5%
    requestTimestampMargin: 128,
    maxPositiveTokenRebase: 5_000_000 // 0.05%
  }
  const correctLidoOracleReport = {
    timeElapsed: 24 * 60 * 60,
    preCLBalance: ETH(100_000),
    postCLBalance: ETH(100_001),
    withdrawalVaultBalance: 0,
    finalizationShareRate: ETH(1)
  }
  const correctStakingRouterOracleReport = {
    timeElapsed: 24 * 60 * 60,
    appearedValidators: 10,
    exitedValidators: 5
  }

  before(async () => {
    await hre.ethers.provider.send('hardhat_mine', ['0x400', '0xc']) // mine 1024 blocks
    lidoMock = await LidoMock.new({ from: deployer })
    withdrawalQueueMock = await WithdrawalQueueMock.new({ from: deployer })
    lidoLocatorMock = await LidoLocatorMock.new(lidoMock.address, withdrawalVault, withdrawalQueueMock.address)

    oracleReportSanityChecker = await OracleReportSanityChecker.new(
      lidoLocatorMock.address,
      admin,
      Object.values(defaultLimitsList),
      Object.values(managersRoster),
      {
        from: deployer
      }
    )
  })

  describe('setOracleReportLimits()', () => {
    it('sets limits correctly', async () => {
      const newLimitsList = {
        churnValidatorsByEpochLimit: 50,
        oneOffCLBalanceDecreaseBPLimit: 10_00,
        annualBalanceIncreaseBPLimit: 15_00,
        shareRateDeviationBPLimit: 1_50, // 1.5%
        requestTimestampMargin: 2048,
        maxPositiveTokenRebase: 10_000_000
      }
      const limitsBefore = await oracleReportSanityChecker.getOracleReportLimits()
      assert.notEquals(limitsBefore.churnValidatorsByEpochLimit, newLimitsList.churnValidatorsByEpochLimit)
      assert.notEquals(limitsBefore.oneOffCLBalanceDecreaseBPLimit, newLimitsList.oneOffCLBalanceDecreaseBPLimit)
      assert.notEquals(limitsBefore.annualBalanceIncreaseBPLimit, newLimitsList.annualBalanceIncreaseBPLimit)
      assert.notEquals(limitsBefore.shareRateDeviationBPLimit, newLimitsList.shareRateDeviationBPLimit)
      assert.notEquals(limitsBefore.requestTimestampMargin, newLimitsList.requestTimestampMargin)
      assert.notEquals(limitsBefore.maxPositiveTokenRebase, newLimitsList.maxPositiveTokenRebase)

      await oracleReportSanityChecker.setOracleReportLimits(Object.values(newLimitsList), {
        from: managersRoster.allLimitsManagers[0]
      })

      const limitsAfter = await oracleReportSanityChecker.getOracleReportLimits()
      assert.equals(limitsAfter.churnValidatorsByEpochLimit, newLimitsList.churnValidatorsByEpochLimit)
      assert.equals(limitsAfter.oneOffCLBalanceDecreaseBPLimit, newLimitsList.oneOffCLBalanceDecreaseBPLimit)
      assert.equals(limitsAfter.annualBalanceIncreaseBPLimit, newLimitsList.annualBalanceIncreaseBPLimit)
      assert.equals(limitsAfter.shareRateDeviationBPLimit, newLimitsList.shareRateDeviationBPLimit)
      assert.equals(limitsAfter.requestTimestampMargin, newLimitsList.requestTimestampMargin)
      assert.equals(limitsAfter.maxPositiveTokenRebase, newLimitsList.maxPositiveTokenRebase)
    })
  })

  describe('checkLidoOracleReport()', () => {
    before(async () => {
      await hre.ethers.provider.send('hardhat_mine', ['0x400', '0xc'])
    })

    beforeEach(async () => {
      await oracleReportSanityChecker.setOracleReportLimits(Object.values(defaultLimitsList), {
        from: managersRoster.allLimitsManagers[0]
      })
    })

    it('reverts with error IncorrectWithdrawalsVaultBalance() when actual withdrawal vault balance is less than passed', async () => {
      const currentWithdrawalVaultBalance = await hre.ethers.provider.getBalance(withdrawalVault)
      await assert.revertsWithCustomError(
        oracleReportSanityChecker.checkLidoOracleReport(
          ...Object.values({ ...correctLidoOracleReport, withdrawalVaultBalance: currentWithdrawalVaultBalance.add(1) })
        ),
        `IncorrectWithdrawalsVaultBalance(${currentWithdrawalVaultBalance.toString()})`
      )
    })

    it('reverts with error IncorrectCLBalanceDecrease() when one off CL balance decrease more than limit', async () => {
      const maxBasisPoints = 10_000n
      const preCLBalance = wei(100_000)
      const postCLBalance = wei(85_000)
      const withdrawalVaultBalance = wei(500)
      const unifiedPostCLBalance = postCLBalance + withdrawalVaultBalance
      const oneOffCLBalanceDecreaseBP = (maxBasisPoints * (preCLBalance - unifiedPostCLBalance)) / preCLBalance
      await assert.revertsWithCustomError(
        oracleReportSanityChecker.checkLidoOracleReport(
          ...Object.values({
            ...correctLidoOracleReport,
            preCLBalance: preCLBalance.toString(),
            postCLBalance: postCLBalance.toString(),
            withdrawalVaultBalance: withdrawalVaultBalance.toString()
          })
        ),
        `IncorrectCLBalanceDecrease(${oneOffCLBalanceDecreaseBP.toString()})`
      )
    })

    it('reverts with error IncorrectCLBalanceIncrease() when reported values overcome annual CL balance limit', async () => {
      const maxBasisPoints = 10_000n
      const secondsInOneYear = 365n * 24n * 60n * 60n
      const preCLBalance = BigInt(correctLidoOracleReport.preCLBalance)
      const postCLBalance = wei(150_000)
      const timeElapsed = BigInt(correctLidoOracleReport.timeElapsed)
      const annualBalanceIncrease =
        (secondsInOneYear * maxBasisPoints * (postCLBalance - preCLBalance)) / preCLBalance / timeElapsed
      await assert.revertsWithCustomError(
        oracleReportSanityChecker.checkLidoOracleReport(
          ...Object.values({
            ...correctLidoOracleReport,
            postCLBalance: postCLBalance.toString()
          })
        ),
        `IncorrectCLBalanceIncrease(${annualBalanceIncrease.toString()})`
      )
    })

    it('reverts with error IncorrectFinalizationShareRate() when reported and onchain share rate differs', async () => {
      const finalizationShareRate = BigInt(ETH(1.05))
      const actualShareRate = BigInt(ETH(1))
      const deviation = (100_00n * (finalizationShareRate - actualShareRate)) / actualShareRate
      await assert.revertsWithCustomError(
        oracleReportSanityChecker.checkLidoOracleReport(
          ...Object.values({ ...correctLidoOracleReport, finalizationShareRate: finalizationShareRate.toString() })
        ),
        `IncorrectFinalizationShareRate(${deviation.toString()})`
      )
    })

    it('passes all checks with correct oracle report data', async () => {
      await oracleReportSanityChecker.checkLidoOracleReport(...Object.values(correctLidoOracleReport))
    })
  })

  describe('checkStakingRouterOracleReport()', () => {
    it('reverts with error IncorrectAppearedValidators() when appeared validators is greater than churn limit', async () => {
      const EPOCH_DURATION = 32n * 12n
      const churnLimit =
        (BigInt(defaultLimitsList.churnValidatorsByEpochLimit) * BigInt(correctLidoOracleReport.timeElapsed)) /
        EPOCH_DURATION
      await assert.revertsWithCustomError(
        oracleReportSanityChecker.checkStakingRouterOracleReport(
          ...Object.values({
            ...correctStakingRouterOracleReport,
            appearedValidators: Number(churnLimit.toString()) + 1
          })
        ),
        `IncorrectAppearedValidators(${churnLimit.toString()})`
      )
    })

    it('reverts with error IncorrectExitedValidators() when exited validators is greater than churn limit', async () => {
      const EPOCH_DURATION = 32n * 12n
      const churnLimit =
        (BigInt(defaultLimitsList.churnValidatorsByEpochLimit) * BigInt(correctLidoOracleReport.timeElapsed)) /
        EPOCH_DURATION
      await assert.revertsWithCustomError(
        oracleReportSanityChecker.checkStakingRouterOracleReport(
          ...Object.values({
            ...correctStakingRouterOracleReport,
            exitedValidators: Number(churnLimit.toString()) + 1
          })
        ),
        `IncorrectExitedValidators(${churnLimit.toString()})`
      )
    })

    it('passes all checks with correct staking router report data', async () => {
      await oracleReportSanityChecker.checkStakingRouterOracleReport(...Object.values(correctStakingRouterOracleReport))
    })
  })

  describe('checkWithdrawalQueueOracleReport()', async () => {
    const oldRequestId = 1
    const newRequestId = 2
    let oldRequestCreationTimestamp, newRequestCreationTimestamp
    const correctWithdrawalQueueOracleReport = {
      requestIdToFinalizeUpTo: oldRequestId,
      refReportTimestamp: -1
    }

    before(async () => {
      const currentBlockNumber = await hre.ethers.provider.getBlockNumber()
      const currentBlock = await hre.ethers.provider.getBlock(currentBlockNumber)
      correctWithdrawalQueueOracleReport.refReportTimestamp = currentBlock.timestamp
      oldRequestCreationTimestamp = currentBlock.timestamp - defaultLimitsList.requestTimestampMargin
      correctWithdrawalQueueOracleReport.requestIdToFinalizeUpTo = oldRequestCreationTimestamp
      await withdrawalQueueMock.setRequestBlockNumber(oldRequestId, oldRequestCreationTimestamp)
      newRequestCreationTimestamp = currentBlock.timestamp - Math.floor(defaultLimitsList.requestTimestampMargin / 2)
      await withdrawalQueueMock.setRequestBlockNumber(newRequestId, newRequestCreationTimestamp)
    })

    it('reverts with the error IncorrectRequestFinalization() when the creation timestamp of requestIdToFinalizeUpTo is too close to report timestamp', async () => {
      await assert.revertsWithCustomError(
        oracleReportSanityChecker.checkWithdrawalQueueOracleReport(
          ...Object.values({
            ...correctWithdrawalQueueOracleReport,
            requestIdToFinalizeUpTo: newRequestId
          })
        ),
        `IncorrectRequestFinalization(${newRequestCreationTimestamp})`
      )
    })

    it('passes all checks with correct staking router report data', async () => {
      await oracleReportSanityChecker.checkWithdrawalQueueOracleReport(
        ...Object.values(correctWithdrawalQueueOracleReport)
      )
    })
  })
})
