//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import { PoseidonT3 } from "./Poseidon.sol"; //an existing library to perform Poseidon hash on solidity
import "./verifier.sol"; //inherits with the MerkleTreeInclusionProof verifier contract
import "hardhat/console.sol";

contract MerkleTree is Verifier {
    uint256[] public hashes; // the Merkle tree in flattened array form
    uint256 public index = 0; // the current index of the first unfilled leaf
    uint256 public root; // the current Merkle root
    uint256 constant public MAX_LEAVES_NUMBER = 8;
    uint256 constant public TREE_ELEMENTS_NUMBER = (MAX_LEAVES_NUMBER * 2) - 1;
    

    constructor() {
        // [assignment] initialize a Merkle tree of 8 with blank leaves

        // The solution here is naive, but because all leaves are 0 I think it is proper solution.
        // Since it is initialization of a tree, and no variables are used, this should not be a problem.

        hashes = new uint256[](TREE_ELEMENTS_NUMBER); // 15 = 8 (leaves) + 4 (branches) + 2 (branches) + 1 (root)
        // filling first 8 slots (0-7) with 0 - those are leaves
        for (uint256 i = 0; i < 8; i++) {
           hashes[i] = 0;
        }
        // filling next 4 slots (8-11) with poseidon(0,0)
        for (uint256 i = 8; i < 12; i++) {
            hashes[i] = PoseidonT3.poseidon([hashes[0], hashes[1]]);
        }
        // filling next 2 slots (12-13)
        for (uint256 i = 12; i < 14; i++) {
            hashes[i] = PoseidonT3.poseidon([hashes[8], hashes[9]]);
        }
        // filling last slot 14
        hashes[14] = PoseidonT3.poseidon([hashes[12], hashes[13]]);

        root = hashes[14];
    }

    function insertLeaf(uint256 hashedLeaf) public returns (uint256) {
        // [assignment] insert a hashed leaf into the Merkle tree
        // Variables needed for algorithm of hashing a tree
        uint256 level = MAX_LEAVES_NUMBER;
        // uint256 substraction = level/2;
        uint256 lowIndex = MAX_LEAVES_NUMBER;
        uint256 highIndex = MAX_LEAVES_NUMBER + level/2;

        // Check if index is less than maximum number of leaves
        require(index < MAX_LEAVES_NUMBER, "Number of leaves is to high");

        // Find index of first empty leaf
        for (uint256 i = 0; i < MAX_LEAVES_NUMBER; i++) {
            if (hashes[i] == 0) {
                hashes[i] = hashedLeaf;
                index = i;
                break;
            }
        }
        
        // Hash all levels of the tree from leaves
        while (level > 0) {
            for (uint256 i = lowIndex; i < highIndex; i++) {
                if (i % 2 == 0) {
                    hashes[i] = PoseidonT3.poseidon([hashes[i - level], hashes[i - level + 1]]);
                }
            }

            level = level/2;
            lowIndex = highIndex;
            highIndex += level/2;

            if (highIndex > TREE_ELEMENTS_NUMBER) {
                break;
            }
        }

        root = hashes[TREE_ELEMENTS_NUMBER - 1];
        return root;
    }

    function verify(
            uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[1] memory input
        ) public view returns (bool) {

        // [assignment] verify an inclusion proof and check that the proof root matches current root
        bool proofRootEqCurrRoot = input[0] == root;
        return verifyProof(a, b, c, input) && proofRootEqCurrRoot;
    }
}
