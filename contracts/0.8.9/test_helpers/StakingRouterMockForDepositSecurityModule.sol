// SPDX-FileCopyrightText: 2022 Lido <info@lido.fi>

// SPDX-License-Identifier: GPL-3.0

/* See contracts/COMPILERS.md */
pragma solidity 0.8.9;

import {IStakingRouter} from "../DepositSecurityModule.sol";

contract StakingRouterMockForDepositSecurityModule is IStakingRouter {
    event StakingModuleDeposited(uint256 maxDepositsCount, uint24 stakingModuleId, bytes depositCalldata);
    event StakingModuleStatusChanged(
        uint24 indexed stakingModuleId,
        address indexed actor,
        StakingModuleStatus fromStatus,
        StakingModuleStatus toStatus
    );

    StakingModuleStatus private status;
    uint256 private stakingModuleKeysOpIndex;
    uint256 private stakingModuleLastDepositBlock;

    function getStakingRewardsDistribution() external returns (address[] memory recipients, uint16[] memory moduleFees, uint16 totalFee) {}

    function deposit(
        uint256 maxDepositsCount,
        uint24 stakingModuleId,
        bytes calldata depositCalldata
    ) external returns (uint256 keysCount) {
        emit StakingModuleDeposited(maxDepositsCount, stakingModuleId, depositCalldata);
        return maxDepositsCount;
    }

    function setWithdrawalCredentials(bytes32 _withdrawalCredentials) external {}

    function getStakingModuleStatus(uint24) external view returns (StakingModuleStatus) {
        return status;
    }

    function setStakingModuleStatus(uint24 _stakingModuleId, StakingModuleStatus _status) external {
        emit StakingModuleStatusChanged(_stakingModuleId, msg.sender, status, _status);
        status = _status;
    }

    function pauseStakingModule(uint24 stakingModuleId) external {
        emit StakingModuleStatusChanged(stakingModuleId, msg.sender, status, StakingModuleStatus.DepositsPaused);
        status = StakingModuleStatus.DepositsPaused;
    }

    function unpauseStakingModule(uint24 stakingModuleId) external {
        emit StakingModuleStatusChanged(stakingModuleId, msg.sender, status, StakingModuleStatus.Active);
        status = StakingModuleStatus.Active;
    }

    function getWithdrawalCredentials() external view returns (bytes32) {}

    function getStakingModuleIsStopped(uint24) external view returns (bool) {
        return status == StakingModuleStatus.Stopped;
    }

    function getStakingModuleIsDepositsPaused(uint24) external view returns (bool) {
        return status == StakingModuleStatus.DepositsPaused;
    }

    function getStakingModuleIsActive(uint24) external view returns (bool) {
        return status == StakingModuleStatus.Active;
    }

    function getStakingModuleKeysOpIndex(uint24) external view returns (uint256) {
        return stakingModuleKeysOpIndex;
    }

    function getStakingModuleLastDepositBlock(uint24) external view returns (uint256) {
        return stakingModuleLastDepositBlock;
    }

    function setStakingModuleKeysOpIndex(uint256 value) external {
        stakingModuleKeysOpIndex = value;
    }

    function setStakingModuleLastDepositBlock(uint256 value) external {
        stakingModuleLastDepositBlock = value;
    }
}
