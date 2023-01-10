// SPDX-FileCopyrightText: 2023 Lido <info@lido.fi>

// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.4.24;

import "../Lido.sol";

/**
 * @dev This is a mock. Don't use in production.
 */
contract OracleMock {
    Lido private pool;
    address private beaconReceiver;

    function setPool(address _pool) external {
        pool = Lido(_pool);
    }

    function reportBeacon(
        uint256 /*_epochId*/,
        uint128 _beaconValidators,
        uint128 _beaconBalance
    ) external {
        uint256[] memory empty = new uint256[](0);
        uint256 wcBufferedEther = 0;
        uint256 withdrawalsReserveAmount = 0;
        pool.handleOracleReport(
            _beaconValidators,
            _beaconBalance,
            wcBufferedEther,
            withdrawalsReserveAmount,
            empty,
            empty
        );
    }

    function setBeaconReportReceiver(address _receiver) public {
        beaconReceiver = _receiver;
    }

    function getBeaconReportReceiver() external view returns (address) {
        return beaconReceiver;
    }
}
